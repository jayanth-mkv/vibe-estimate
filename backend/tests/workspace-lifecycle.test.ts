import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { FixtureProvider } from "../src/ai.js";
import { FixtureHomeProvider } from "../src/home-ai.js";
import { HomeService } from "../src/home-service.js";
import { HomeStore } from "../src/home-store.js";
import { RoomStore } from "../src/room-store.js";
import { HomeCollaboration } from "../src/home-collaboration.js";
import { WorkspaceLifecycle, type LifecycleDatabase, type LifecycleReceipt, type LifecycleTransaction, type TrashItem } from "../src/workspace-lifecycle.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";
import { MemoryHomeDatabase, MemoryHomeCollaborationDatabase } from "./home-helpers.js";
import type { HomeRevision } from "../src/home-types.js";

class MemoryLifecycleDatabase implements LifecycleDatabase {
  receipts = new Map<string, LifecycleReceipt>();
  failNext = false;
  constructor(private homes: MemoryHomeDatabase, private rooms: MemoryRoomDatabase) {}
  transaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T> {
    return this.homes.mutex.run(async () => {
      const homes = structuredClone(this.homes.homes), rooms = structuredClone(this.rooms.rooms), homeOwners = structuredClone(this.homes.owners), roomOwners = structuredClone(this.rooms.owners), deliveries = structuredClone(this.rooms.deliveries), receipts = structuredClone(this.receipts);
      const result = await operation({
        getHome: async (uid, id) => { const home = homes.get(id); return home?.ownerId === uid ? home : undefined; }, putHome: home => { homes.set(home.id, home); },
        getRoom: async id => rooms.get(id), putRoom: room => { rooms.set(room.id, room); },
        getHomeOwner: async uid => homeOwners.get(uid) ?? { homeIds: [], creations: {}, callsUsed: 0 }, putHomeOwner: (uid, owner) => { homeOwners.set(uid, owner); },
        getRoomOwner: async uid => roomOwners.get(uid) ?? { projects: {} }, putRoomOwner: (uid, owner) => { roomOwners.set(uid, owner); },
        getDelivery: async id => deliveries.get(id), putDelivery: delivery => { deliveries.set(delivery.id, delivery); },
        getReceipt: async (uid, id) => receipts.get(`${uid}/${id}`), putReceipt: (uid, id, receipt) => { receipts.set(`${uid}/${id}`, receipt); },
      });
      if (this.failNext) { this.failNext = false; throw new Error("Private storage failure"); }
      this.homes.homes = homes; this.rooms.rooms = rooms; this.homes.owners = homeOwners; this.rooms.owners = roomOwners; this.rooms.deliveries = deliveries; this.receipts = receipts;
      return structuredClone(result);
    });
  }
  async list(uid: string) {
    return structuredClone([...this.homes.homes.values(), ...this.rooms.rooms.values()].flatMap(record => record.ownerId === uid && record.trash && (record.trash.kind !== "home" || "headRevisionId" in record) ? [record.trash] : []));
  }
}

describe("saved workspace trash, restoration and lifecycle fencing", () => {
  let projects: MemoryProjectStore; let homeDb: MemoryHomeDatabase; let roomDb: MemoryRoomDatabase; let collaborationDb: MemoryHomeCollaborationDatabase; let lifecycleDb: MemoryLifecycleDatabase;
  let homes: HomeService; let rooms: RoomStore; let collaboration: HomeCollaboration; let lifecycle: WorkspaceLifecycle; let provider: FixtureHomeProvider; let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    projects = new MemoryProjectStore(); homeDb = new MemoryHomeDatabase(projects); roomDb = new MemoryRoomDatabase(projects); collaborationDb = new MemoryHomeCollaborationDatabase(homeDb, roomDb); lifecycleDb = new MemoryLifecycleDatabase(homeDb, roomDb);
    provider = new FixtureHomeProvider(); homes = new HomeService(new HomeStore(homeDb), provider, projects); rooms = new RoomStore(roomDb, "fixture", Date.now, true); collaboration = new HomeCollaboration(collaborationDb, homes, rooms); lifecycle = new WorkspaceLifecycle(lifecycleDb);
    app = createApp({ config: readConfig({}), store: projects, provider: new FixtureProvider(), homes, rooms, homeCollaboration: collaboration, lifecycle, verifyToken: async token => ({ uid: token }) });
  });
  const post = (uid: string, path: string, body: unknown) => request(app).post(path).set("Authorization", `Bearer ${uid}`).send(body);
  const get = (uid: string, path: string) => request(app).get(path).set("Authorization", `Bearer ${uid}`);
  const restore = (item: TrashItem, requestId = randomUUID()) => lifecycle.restore("owner", { kind: item.kind, id: item.id, trashId: item.trashId, requestId });
  async function home() { const home = await homes.store.create("owner", randomUUID()); return homes.template("owner", home.id, { requestId: randomUUID(), templateId: "family-home", baseRevisionId: null }); }
  async function shared() {
    const saved = await home(); const result = await collaboration.createRoom("owner", saved.id, { requestId: randomUUID() });
    await rooms.joinCode("client", result.joinCode!); return result;
  }
  const trashHome = async (id: string) => lifecycle.trash("owner", "home", id, { requestId: randomUUID(), baseRevisionId: homeDb.homes.get(id)!.headRevisionId });
  it("requires authenticated owner authority for all lifecycle endpoints without leaking private entries", async () => {
    const state = await shared(); const input = { requestId: randomUUID(), baseRevisionId: state.home.headRevisionId };
    await request(app).post(`/api/homes/${state.home.id}/trash`).send(input).expect(401);
    await request(app).get("/api/trash").expect(401);
    await request(app).post("/api/trash/restore").send({}).expect(401);
    for (const uid of ["client", "other"]) {
      await post(uid, `/api/homes/${state.home.id}/trash`, input).expect(404);
      await post(uid, `/api/rooms/${state.room.id}/trash`, { requestId: randomUUID() }).expect(404);
    }
    const item = await trashHome(state.home.id);
    for (const uid of ["client", "other"]) {
      expect((await get(uid, "/api/trash").expect(200)).body.items).toEqual([]);
      await post(uid, "/api/trash/restore", { kind: "home", id: state.home.id, trashId: item.trashId, requestId: randomUUID() }).expect(404);
    }
    expect(await lifecycle.list("owner")).toEqual([item]);
  });
  it("atomically hides the linked home/room and preserves evidence, revisions, decisions, memberships, counters and original projects", async () => {
    const state = await shared(); const roomId = state.room.id, homeId = state.home.id;
    await rooms.message("client", roomId, { requestId: randomUUID(), text: "Keep the dining table." });
    await collaboration.decision("client", roomId, "accept", { requestId: randomUUID(), revisionId: state.home.headRevisionId! });
    const beforeHome = structuredClone(homeDb.homes.get(homeId)!); const beforeRoom = structuredClone(roomDb.rooms.get(roomId)!); const beforeLink = structuredClone(collaborationDb.links.get(roomId)); const beforeRevisions = structuredClone(homeDb.revisions); const beforeProjects = structuredClone(projects.projects);
    const item = (await post("owner", `/api/rooms/${roomId}/trash`, { requestId: randomUUID() }).expect(200)).body.item as TrashItem;
    expect(item).toMatchObject({ kind: "home", id: homeId, roomId, name: state.home.title });
    expect((await get("owner", "/api/homes").expect(200)).body.homes).toEqual([]);
    for (const uid of ["owner", "client"]) {
      await get(uid, `/api/rooms/${roomId}`).expect(404); await get(uid, `/api/rooms/${roomId}/home`).expect(404);
      await get(uid, `/api/rooms/${roomId}/home/revisions/${state.home.headRevisionId}`).expect(404);
      await post(uid, `/api/rooms/${roomId}/messages`, { requestId: randomUUID(), text: "Late message" }).expect(404);
    }
    await get("owner", `/api/homes/${homeId}`).expect(404);
    await get("owner", `/api/homes/${homeId}/export?revisionId=${state.home.headRevisionId}`).expect(404);
    await post("owner", `/api/homes/${homeId}/template`, { requestId: randomUUID(), baseRevisionId: state.home.headRevisionId, templateId: "family-home" }).expect(404);
    await post("owner", `/api/homes/${homeId}/summary`, { requestId: randomUUID(), baseRevisionId: state.home.headRevisionId }).expect(404);
    await post("owner", `/api/rooms/${roomId}/invite`, {}).expect(404);
    await post("owner", `/api/rooms/${roomId}/observer`, { action: "resume" }).expect(404);
    expect(homeDb.revisions).toEqual(beforeRevisions); expect(projects.projects).toEqual(beforeProjects); expect(collaborationDb.links.get(roomId)).toEqual(beforeLink);
    await restore(item);
    const reopened = await collaboration.get("client", roomId);
    expect(reopened.home.scene).toEqual(state.home.scene); expect(reopened.room.messages).toHaveLength(1);
    expect(homeDb.homes.get(homeId)!.revisions).toEqual(beforeHome.revisions); expect(homeDb.homes.get(homeId)!.callsUsed).toBe(beforeHome.callsUsed);
    expect(roomDb.rooms.get(roomId)!.messages).toEqual(beforeRoom.messages); expect(roomDb.rooms.get(roomId)!.clientId).toBe("client");
    expect(roomDb.rooms.get(roomId)!.paused).toBe(true); expect(roomDb.rooms.get(roomId)!.invite.expiresAt).toBe(0);
    await expect(rooms.join("client", roomId, state.inviteToken!)).rejects.toMatchObject({ code: "INVITE_INVALID" });
    await expect(rooms.joinCode("client", state.joinCode!)).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });
  it("deduplicates double deletion, prevents old delete replay after restore and rejects request reuse/stale restore", async () => {
    const saved = await home(); const input = { requestId: randomUUID(), baseRevisionId: saved.headRevisionId };
    const [first, second] = await Promise.all([lifecycle.trash("owner", "home", saved.id, input), lifecycle.trash("owner", "home", saved.id, input)]);
    expect(second).toEqual(first);
    await expect(lifecycle.trash("owner", "home", saved.id, { ...input, baseRevisionId: randomUUID() })).rejects.toMatchObject({ code: "REQUEST_REUSED" });
    const restoreRequest = randomUUID(); expect(await restore(first, restoreRequest)).toEqual(await restore(first, restoreRequest));
    expect(await lifecycle.trash("owner", "home", saved.id, input)).toEqual(first);
    expect(await homes.store.get("owner", saved.id)).toMatchObject({ headRevisionId: saved.headRevisionId });
    const newer = await trashHome(saved.id); expect(newer.trashId).not.toBe(first.trashId);
    await expect(restore(first)).rejects.toMatchObject({ code: "TRASH_CHANGED" });
    await restore(first, restoreRequest); expect(homeDb.homes.get(saved.id)!.trash?.trashId).toBe(newer.trashId);
    await restore(newer);
  });
  it("rejects a stale selected home revision and rolls back home/room deletion on save failure", async () => {
    const state = await shared();
    await post("owner", `/api/homes/${state.home.id}/trash`, { requestId: randomUUID(), baseRevisionId: randomUUID() }).expect(409);
    const input = { requestId: randomUUID(), baseRevisionId: state.home.headRevisionId }; lifecycleDb.failNext = true;
    await post("owner", `/api/homes/${state.home.id}/trash`, input).expect(503);
    expect(homeDb.homes.get(state.home.id)!.trash).toBeUndefined(); expect(roomDb.rooms.get(state.room.id)!.trash).toBeUndefined(); expect(await lifecycle.list("owner")).toEqual([]);
    await post("owner", `/api/homes/${state.home.id}/trash`, input).expect(200);
  });
  it("cancels a running generation across delete/restore without late revisions, extra calls or restarted request", async () => {
    const saved = await home(); const originalGenerate = provider.generate.bind(provider);
    let release!: () => void; let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(provider, "generate").mockImplementation(async (...args) => { started(); await gate; return originalGenerate(...args); });
    const input = { requestId: randomUUID(), baseRevisionId: saved.headRevisionId!, prompt: "Add warm ceiling lights.", selection: { kind: "home" as const } };
    const running = homes.generate("owner", saved.id, input); await ready;
    const item = await trashHome(saved.id); await restore(item); release();
    const result = await running; expect(result.job.status).toBe("cancelled"); expect(result.home.headRevisionId).toBe(saved.headRevisionId); expect(homeDb.revisions.size).toBe(1);
    expect(homeDb.homes.get(saved.id)!.callsUsed).toBe(1); expect(homeDb.owners.get("owner")!.callsUsed).toBe(1); expect(homeDb.owners.get("owner")!.active).toBeUndefined();
    await homes.generate("owner", saved.id, input); expect(spy).toHaveBeenCalledTimes(1);
  });
  it("cancels staged saves and denies a manual publication started before the deletion generation", async () => {
    const saved = await home(); const requestId = randomUUID(); const base = await homes.store.revision("owner", saved.id, saved.headRevisionId!);
    const staged: HomeRevision = { ...base, id: randomUUID(), parentRevisionId: base.id, requestId, source: "fixture" };
    await homes.store.beginJob("owner", saved.id, { requestId, hash: "test", kind: "generate", baseRevisionId: base.id });
    await homes.store.stage("owner", saved.id, requestId, { revision: staged });
    const item = await trashHome(saved.id); await restore(item);
    await expect(homes.store.resume("owner", saved.id, requestId)).rejects.toMatchObject({ code: "HOME_SAVE_NOT_READY" });
    await expect(homes.store.publish("owner", saved.id, { requestId: randomUUID(), hash: "late", kind: "manual", baseRevisionId: base.id, revision: { ...base, id: randomUUID() }, lifecycleVersion: 0 })).rejects.toMatchObject({ code: "HOME_CHANGED" });
    expect((await homes.store.get("owner", saved.id)).headRevisionId).toBe(base.id);
  });
  it("fences late legacy observer completion, invalidates outbox work and prevents recreation from the old source project", async () => {
    const project = await projects.create("owner", { name: "Room project", scope: "Living room furnishing.", messages: "Keep the sofa." });
    const created = await rooms.create("owner", project.id);
    await rooms.joinCode("client", created.joinCode); await rooms.message("client", created.room.id, { requestId: randomUUID(), text: "Please add another sofa." });
    roomDb.rooms.get(created.room.id)!.nextRunAt = 0;
    const claimed = await rooms.claim(created.room.id); expect(claimed).toBeTruthy(); const deliveryId = roomDb.rooms.get(created.room.id)!.delivery!.id;
    const item = await lifecycle.trash("owner", "room", created.room.id, { requestId: randomUUID() });
    await expect(rooms.create("owner", project.id)).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
    expect(await rooms.claim(created.room.id)).toBeUndefined(); expect(await rooms.delivery(deliveryId)).toBeUndefined(); expect(await rooms.hasPendingReview(created.room.id)).toBe(false);
    await restore(item); await rooms.finish(created.room.id, claimed!.run.id, { error: "Late model error" });
    expect(roomDb.rooms.get(created.room.id)!.observer).toMatchObject({ status: "paused", callsUsed: 1 }); expect(roomDb.rooms.get(created.room.id)!.snapshots).toEqual([]); expect(roomDb.deliveries.get(deliveryId)!.status).toBe("failed");
    expect(roomDb.owners.get("owner")!.active).toBeUndefined(); expect(projects.projects.get(project.id)).toEqual(project);
  });
  it("makes capacity reusable without resetting spent allowance, and refuses restore when capacity is full", async () => {
    const saved = await home(); homeDb.homes.get(saved.id)!.callsUsed = 8; homeDb.owners.get("owner")!.callsUsed = 19;
    for (let i = 1; i < 20; i++) await homes.store.create("owner", randomUUID());
    const item = await trashHome(saved.id); await homes.store.create("owner", randomUUID());
    await expect(restore(item)).rejects.toMatchObject({ code: "HOME_LIMIT" }); expect(homeDb.homes.get(saved.id)!.trash).toEqual(item);
    const other = homeDb.owners.get("owner")!.homeIds.find(id => id !== saved.id)!; await trashHome(other); await restore(item);
    expect(homeDb.homes.get(saved.id)!.callsUsed).toBe(8); expect(homeDb.owners.get("owner")!.callsUsed).toBe(19); expect(await homes.store.list("owner")).toHaveLength(20);
  });
  it("rejects in-flight home-room association after trash/restore without leaving an orphan room", async () => {
    const saved = await home(); const original = homes.proposal.bind(homes); let release!: () => void; let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(homes, "proposal").mockImplementation(async (...args) => { const result = await original(...args); started(); await gate; return result; });
    const creating = collaboration.createRoom("owner", saved.id, { requestId: randomUUID() }); const rejected = expect(creating).rejects.toMatchObject({ code: "SHARED_HOME_NOT_FOUND" }); await ready;
    const item = await trashHome(saved.id); await restore(item); release(); await rejected;
    expect(roomDb.rooms.size).toBe(0); expect(collaborationDb.links.size).toBe(0); expect(homeDb.homes.get(saved.id)!.roomId).toBeUndefined();
  });
  it("releases shared-room capacity and atomically refuses a linked restore when the room allowance is full", async () => {
    const state = await shared();
    for (let index = 1; index < 10; index++) {
      const project = await projects.create("owner", { name: `Room ${index}`, scope: "Living room furnishing.", messages: "Keep the sofa." }); await rooms.create("owner", project.id);
    }
    const item = await trashHome(state.home.id);
    const replacement = await projects.create("owner", { name: "Replacement", scope: "Living room furnishing.", messages: "Keep the sofa." }); await rooms.create("owner", replacement.id);
    await expect(restore(item)).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(homeDb.homes.get(state.home.id)!.trash).toEqual(item); expect(roomDb.rooms.get(state.room.id)!.trash).toEqual(item);
    expect(homeDb.owners.get("owner")!.homeIds).not.toContain(state.home.id);
  });
  it("fences an agreement publication delayed until after the home was trashed and restored", async () => {
    const state = await shared(); const revisionId = state.home.headRevisionId!;
    await collaboration.decision("client", state.room.id, "accept", { requestId: randomUUID(), revisionId });
    await collaboration.decision("owner", state.room.id, "approve", { requestId: randomUUID(), revisionId });
    const original = homes.store.summary.bind(homes.store); let release!: () => void; let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(homes.store, "summary").mockImplementation(async (...args) => { const result = await original(...args); started(); await gate; return result; });
    const running = collaboration.agreement("owner", state.room.id, { requestId: randomUUID(), revisionId });
    const rejected = expect(running).rejects.toMatchObject({ code: "DESIGN_CHANGED" }); await ready;
    const item = await trashHome(state.home.id); await restore(item); release(); await rejected;
    expect(collaborationDb.links.get(state.room.id)!.agreements).toEqual([]);
    expect(collaborationDb.links.get(state.room.id)!.decisions).toHaveLength(2);
  });
});
