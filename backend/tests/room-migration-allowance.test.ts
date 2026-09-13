import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { FixtureProvider } from "../src/ai.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { newInvite, newRoom, ROOM_CALL_LIMIT, ROOM_DEBOUNCE_MS } from "../src/room-domain.js";
import { RoomStore } from "../src/room-store.js";
import type { RoomOwner } from "../src/room-types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

describe("reviewed room imports preserve the remaining new-room allowance", () => {
  let projects: MemoryProjectStore;
  let database: MemoryRoomDatabase;
  let rooms: RoomStore;
  let now: number;
  const input = { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES };
  beforeEach(() => {
    now = 1750000000000;
    projects = new MemoryProjectStore(); database = new MemoryRoomDatabase(projects);
    rooms = new RoomStore(database, "fixture", () => now);
  });
  async function seedImported(count: number) {
    const index = database.owners.get("owner") ?? { projects: {} };
    const imported: string[] = [];
    for (let index = 0; index < count; index++) {
      const project = await projects.create("owner", input);
      const room = newRoom(project, "fixture", newInvite(now).stored, now);
      database.rooms.set(room.id, room); imported.push(project.id);
    }
    for (const projectId of imported) index.projects[projectId] = [...database.rooms.values()].find(room => room.projectId === projectId)!.id;
    index.migratedProjectIds = imported;
    database.owners.set("owner", index);
    return imported;
  }
  async function create() {
    const project = await projects.create("owner", input);
    return rooms.create("owner", project.id);
  }

  it("keeps thirteen imported rooms and the existing room, permits nine additions, then rejects further creation atomically", async () => {
    const existing = await create();
    const imported = await seedImported(13);
    for (let index = 0; index < 9; index++) await create();
    expect(database.rooms.size).toBe(23);
    const before = structuredClone(database.owners.get("owner"));
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.owners.get("owner")).toEqual(before);
    expect(database.rooms.size).toBe(23);
    expect((await rooms.create("owner", imported[0]!)).room.id).toBe(before!.projects[imported[0]!]);
    expect((await rooms.create("owner", existing.room.projectId)).room.id).toBe(existing.room.id);
    expect(database.owners.get("owner")!.migratedProjectIds).toEqual(imported);
  });

  const invalidMetadata: [string, (id: string) => unknown][] = [
    ["string", id => id],
    ["null", () => null],
    ["object", id => ({ id })],
    ["duplicate project", id => [id, id]],
    ["unknown project", id => [id, randomUUID()]],
    ["non-UUID project", id => [id, "not-a-project-id"]],
    ["non-string project", id => [id, 1]],
  ];
  it.each(invalidMetadata)("grants no partial exclusion for malformed %s metadata", async (_name, metadata) => {
    const imported = await seedImported(10);
    database.owners.get("owner")!.migratedProjectIds = metadata(imported[0]!) as RoomOwner["migratedProjectIds"];
    const before = structuredClone(database.owners.get("owner"));
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.rooms.size).toBe(10);
    expect(database.owners.get("owner")).toEqual(before);
  });

  it("rejects more than one hundred otherwise valid imported project IDs", async () => {
    await seedImported(101);
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.rooms.size).toBe(101);
  });

  it.each(["not-a-uuid", randomUUID() + "\n"])("does not exclude malformed project keys even when present in the owner index (%j)", async invalid => {
    const imported = await seedImported(10);
    const owner = database.owners.get("owner")!;
    owner.projects[invalid] = owner.projects[imported[0]!]!;
    delete owner.projects[imported[0]!];
    owner.migratedProjectIds = [invalid];
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.rooms.size).toBe(10);
  });

  it("preserves metadata through lease writes while retaining each imported room's historical model limit", async () => {
    const imported = await seedImported(1);
    const roomId = database.owners.get("owner")!.projects[imported[0]!]!;
    database.rooms.get(roomId)!.observer.callsUsed = ROOM_CALL_LIMIT - 1;
    await rooms.message("owner", roomId, { text: "Keep the included lighting.", requestId: randomUUID() });
    now += ROOM_DEBOUNCE_MS;
    const claimed = await rooms.claim(roomId);
    expect(claimed).toBeDefined();
    expect(database.owners.get("owner")!.migratedProjectIds).toEqual(imported);
    await rooms.finish(roomId, claimed!.run.id, { error: "The synthetic review failed." });
    expect(database.owners.get("owner")!.active).toBeUndefined();
    expect(database.owners.get("owner")!.migratedProjectIds).toEqual(imported);
    await rooms.control("owner", roomId, "retry");
    expect(await rooms.claim(roomId)).toBeUndefined();
    expect((await rooms.get("owner", roomId)).observer).toMatchObject({ status: "limit", callsUsed: ROOM_CALL_LIMIT });
  });

  it("keeps import metadata private and rejects API attempts to grant capacity or access another owner's imported room", async () => {
    const imported = await seedImported(1);
    const app = createApp({ config: readConfig({}), store: projects, rooms, provider: new FixtureProvider(), verifyToken: async token => {
      if (!["owner", "stranger"].includes(token)) throw new Error("invalid identity");
      return { uid: token };
    } });
    const projectId = imported[0]!;
    await request(app).post(`/api/projects/${projectId}/room`).send({}).expect(401);
    await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer stranger").send({}).expect(404);
    await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer owner").send({ migratedProjectIds: imported }).expect(422);
    const response = await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer owner").send({}).expect(200);
    expect(JSON.stringify(response.body)).not.toContain("migratedProjectIds");
    expect(database.owners.get("owner")!.migratedProjectIds).toEqual(imported);
  });
});
