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
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";
import { MemoryHomeDatabase, MemoryHomeCollaborationDatabase } from "./home-helpers.js";
import type { SharedHome } from "../src/home-collaboration-types.js";
vi.setConfig({ testTimeout: 30_000 });

describe("shared home identity, exact-revision decisions and saved agreements", () => {
  let projects: MemoryProjectStore; let homeDb: MemoryHomeDatabase; let roomDb: MemoryRoomDatabase; let collaborationDb: MemoryHomeCollaborationDatabase; let homes: HomeService; let rooms: RoomStore; let collaboration: HomeCollaboration; let provider: FixtureHomeProvider; let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    projects = new MemoryProjectStore(); homeDb = new MemoryHomeDatabase(projects); roomDb = new MemoryRoomDatabase(projects); collaborationDb = new MemoryHomeCollaborationDatabase(homeDb, roomDb);
    provider = new FixtureHomeProvider(); homes = new HomeService(new HomeStore(homeDb), provider, projects); rooms = new RoomStore(roomDb, "fixture"); collaboration = new HomeCollaboration(collaborationDb, homes, rooms);
    app = createApp({ config: readConfig({}), store: projects, provider: new FixtureProvider(), homes, rooms, homeCollaboration: collaboration, verifyToken: async token => ({ uid: token }) });
  });
  const post = (uid: string, path: string, body: unknown) => request(app).post(path).set("Authorization", `Bearer ${uid}`).send(body);
  const get = (uid: string, path: string) => request(app).get(path).set("Authorization", `Bearer ${uid}`);
  async function setup() {
    const home = await homes.store.create("designer", randomUUID()); await homes.template("designer", home.id, { requestId: randomUUID(), templateId: "family-home", baseRevisionId: null });
    const result = await collaboration.createRoom("designer", home.id, { requestId: randomUUID() });
    if (!("joinCode" in result)) throw new Error("Expected a new invitation");
    await rooms.joinCode("homeowner", result.joinCode);
    return collaboration.get("designer", result.room.id);
  }
  const choice = (state: SharedHome, requestId = randomUUID()) => ({ revisionId: state.home.headRevisionId!, requestId });
  const generation = (state: SharedHome, requestId = randomUUID()) => ({ baseRevisionId: state.home.headRevisionId!, requestId, prompt: "Add warm ceiling lights throughout the home.", selection: { kind: "home" } });

  it("keeps assistant profiles owner-scoped and private instructions out of the homeowner projection", async () => {
    const input = { requestId: randomUUID(), instructions: "Private designer tone preferences" };
    const profile = await post("designer", "/api/design-assistants", input).expect(201);
    const replay = await post("designer", "/api/design-assistants", input).expect(201); expect(replay.body.assistant.id).toBe(profile.body.assistant.id);
    expect((await get("other", "/api/design-assistants")).body.assistants).toEqual([]);
    const state = await setup(); const own = await get("designer", `/api/rooms/${state.room.id}/home`).expect(200); const client = await get("homeowner", `/api/rooms/${state.room.id}/home`).expect(200);
    expect(own.body.assistant.instructions).toBeTruthy(); expect(client.body.assistant.instructions).toBe(""); expect(client.body.home.proposalProjectId).toBeNull();
  });
  it("binds the existing invitation to a separate real identity and keeps private home/project endpoints denied", async () => {
    const state = await setup();
    await get("other", `/api/rooms/${state.room.id}/home`).expect(404);
    await get("homeowner", `/api/homes/${state.home.id}`).expect(404);
    await get("homeowner", `/api/projects/${state.room.projectId}`).expect(404);
    await get("homeowner", `/api/rooms/${state.room.id}/home/revisions/${state.home.headRevisionId}`).expect(200);
    await get("other", `/api/rooms/${state.room.id}/home/revisions/${state.home.headRevisionId}`).expect(404);
    await post("other", `/api/rooms/${state.room.id}/home/generate`, generation(state)).expect(404);
    await post("homeowner", `/api/rooms/${state.room.id}/home/approve`, choice(state)).expect(403);
    await post("designer", `/api/rooms/${state.room.id}/home/accept`, choice(state)).expect(403);
  });
  it("reopens an existing shared home without rotating its invitation or restarting the old observer", async () => {
    const state = await setup(); const invite = structuredClone(roomDb.rooms.get(state.room.id)!.invite);
    expect((await homes.store.get("designer", state.home.id)).roomId).toBe(state.room.id);
    const reopened = await collaboration.createRoom("designer", state.home.id, { requestId: randomUUID() });
    expect(reopened.room.id).toBe(state.room.id); expect("joinCode" in reopened).toBe(false); expect(roomDb.rooms.get(state.room.id)!.invite).toEqual(invite); expect(roomDb.rooms.get(state.room.id)!.paused).toBe(true);
    await post("designer", `/api/rooms/${state.room.id}/observer`, { action: "resume" }).expect(409);
    expect(await rooms.claim(state.room.id)).toBeUndefined();
  });
  it("saves actual homeowner chat, invokes one scoped design request, and does not impersonate another participant", async () => {
    const state = await setup(); const spy = vi.spyOn(provider, "generate"); const requestId = randomUUID();
    const input = { requestId, baseRevisionId: state.home.headRevisionId, text: "Add warm ceiling lights throughout the home.", askAssistant: true, selection: { kind: "home" } };
    const response = await post("homeowner", `/api/rooms/${state.room.id}/home/messages`, input).expect(200);
    expect(response.body.job.status).toBe("complete"); expect(response.body.room.messages.at(-1)).toMatchObject({ role: "client", text: input.text }); expect(spy).toHaveBeenCalledTimes(1);
    expect(response.body.assistantReplies).toHaveLength(1); expect(response.body.assistantReplies[0]).toMatchObject({ requestId, revisionId: response.body.home.headRevisionId, provider: "fixture", model: "local-fixture" }); expect(response.body.assistantReplies[0].changes.length).toBeGreaterThan(0);
    expect(roomDb.rooms.get(state.room.id)!.messages.at(-1)!.senderId).toBe("homeowner"); expect(roomDb.rooms.get(state.room.id)!.observer.status).toBe("paused");
    const replay = await post("homeowner", `/api/rooms/${state.room.id}/home/messages`, input).expect(200); expect(replay.body.assistantReplies).toHaveLength(1); expect(spy).toHaveBeenCalledTimes(1); expect(roomDb.rooms.get(state.room.id)!.messages).toHaveLength(1);
    await post("homeowner", `/api/rooms/${state.room.id}/home/messages`, { ...input, role: "designer", senderId: "designer" }).expect(422);
  });
  it("requires homeowner acceptance then designer approval of exactly the same saved design", async () => {
    const state = await setup(); const endpoint = `/api/rooms/${state.room.id}/home`;
    await post("designer", `${endpoint}/approve`, choice(state)).expect(409);
    await post("designer", `${endpoint}/agreements`, choice(state)).expect(409);
    const input = choice(state); const accepted = await post("homeowner", `${endpoint}/accept`, input).expect(200); expect(accepted.body.acceptedRevisionId).toBe(state.home.headRevisionId);
    await post("homeowner", `${endpoint}/accept`, input).expect(200); expect((await collaboration.get("designer", state.room.id)).decisions).toHaveLength(1);
    const approved = await post("designer", `${endpoint}/approve`, choice(state)).expect(200); expect(approved.body.canGenerateAgreement).toBe(true);
    const changed = await post("designer", `${endpoint}/generate`, generation(state)).expect(200); expect(changed.body.job.status).toBe("complete"); expect(changed.body.acceptedRevisionId).toBeNull(); expect(changed.body.approvedRevisionId).toBeNull();
    await post("designer", `${endpoint}/agreements`, choice(state)).expect(409); expect(changed.body.decisions).toHaveLength(2);
  });
  it("generates, freezes, replays and downloads a source-linked draft agreement after both design decisions", async () => {
    const state = await setup(); const endpoint = `/api/rooms/${state.room.id}/home`;
    const changed = await post("homeowner", `${endpoint}/messages`, { text: "Add warm ceiling lights throughout the home.", requestId: randomUUID(), askAssistant: true, baseRevisionId: state.home.headRevisionId, selection: { kind: "home" } }).expect(200);
    const current = changed.body as SharedHome;
    await post("homeowner", `${endpoint}/accept`, choice(current)).expect(200); await post("designer", `${endpoint}/approve`, choice(current)).expect(200);
    const spy = vi.spyOn(provider, "summarize"); const input = choice(current);
    const generated = await post("designer", `${endpoint}/agreements`, input).expect(200); expect(generated.body.agreements).toHaveLength(1); expect(spy).toHaveBeenCalledTimes(1);
    const agreement = generated.body.agreements[0]; expect(agreement.status).toBe("draft"); expect(agreement.source.messages[0]).toMatchObject({ role: "client", text: "Add warm ceiling lights throughout the home." }); expect(agreement.source.changes.length).toBeGreaterThan(0);
    expect(agreement.source.acceptedDecisionId).toBeTruthy(); expect(agreement.source.approvedDecisionId).toBeTruthy();
    const replay = await post("designer", `${endpoint}/agreements`, input).expect(200); expect(replay.body.agreements[0]).toEqual(agreement); expect(spy).toHaveBeenCalledTimes(1);
    const exported = await get("homeowner", `${endpoint}/agreements/${agreement.id}/export`).expect(200); expect(exported.text).toContain(current.home.headRevisionId); expect(exported.text).toContain("Terms still to be agreed"); expect(exported.text).toContain("not signatures"); expect(exported.text).toContain("Source conversation");
    await get("other", `${endpoint}/agreements/${agreement.id}/export`).expect(404);
    await post("homeowner", `${endpoint}/agreements`, choice(current)).expect(403);
  });
  it("does not publish an agreement if the layout changes while its AI prose is running", async () => {
    const state = await setup(); const endpoint = `/api/rooms/${state.room.id}/home`;
    await post("homeowner", `${endpoint}/accept`, choice(state)).expect(200); await post("designer", `${endpoint}/approve`, choice(state)).expect(200);
    let entered!: () => void; let release!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); const waiting = new Promise<void>(resolve => { release = resolve; }); const original = provider.summarize.bind(provider);
    vi.spyOn(provider, "summarize").mockImplementation(async context => { entered(); await waiting; return original(context); });
    const pending = post("designer", `${endpoint}/agreements`, choice(state)).then(value => value); await started;
    await homes.restore("designer", state.home.id, { requestId: randomUUID(), baseRevisionId: state.home.headRevisionId!, revisionId: state.home.headRevisionId! }); release();
    const response = await pending; expect(response.body.agreements).toEqual([]); expect(response.body.job.status).toBe("conflict");
  });
  it("never reuses cancelled staged agreement prose or its earlier source conversation in a fresh request", async () => {
    const state = await setup(); const endpoint = `/api/rooms/${state.room.id}/home`;
    await post("homeowner", `${endpoint}/messages`, { text: "The first design discussion.", requestId: randomUUID(), askAssistant: false, baseRevisionId: state.home.headRevisionId, selection: { kind: "home" } }).expect(200);
    await post("homeowner", `${endpoint}/accept`, choice(state)).expect(200); await post("designer", `${endpoint}/approve`, choice(state)).expect(200);
    const spy = vi.spyOn(provider, "summarize").mockResolvedValueOnce({ title: "Earlier draft", narrative: "Earlier cancelled prose." }).mockResolvedValueOnce({ title: "Current draft", narrative: "Current review source and proposed design." });
    vi.spyOn(homes.store, "complete").mockRejectedValueOnce(new Error("saved content awaiting publication"));
    const firstInput = choice(state); const pending = await post("designer", `${endpoint}/agreements`, firstInput).expect(200); expect(pending.body.job.status).toBe("save_pending");
    await post("designer", `${endpoint}/jobs/${firstInput.requestId}/cancel`, { requestId: firstInput.requestId }).expect(200);
    await post("homeowner", `${endpoint}/messages`, { text: "Keep this newest discussion in the draft evidence.", requestId: randomUUID(), askAssistant: false, baseRevisionId: state.home.headRevisionId, selection: { kind: "home" } }).expect(200);
    const fresh = await post("designer", `${endpoint}/agreements`, choice(state)).expect(200);
    expect(fresh.body.agreements).toHaveLength(1); const agreement = fresh.body.agreements[0];
    expect(agreement.markdown).toContain("Current review source"); expect(agreement.markdown).not.toContain("Earlier cancelled prose"); expect(agreement.source.messages.at(-1).text).toContain("newest discussion"); expect(spy).toHaveBeenCalledTimes(2);
  });
});
