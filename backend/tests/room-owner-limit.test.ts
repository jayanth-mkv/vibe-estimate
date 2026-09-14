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

describe("server-managed workspace room capacity", () => {
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
  async function seed(count: number, roomLimit?: number) {
    const owner: RoomOwner = { projects: {}, ...(roomLimit !== undefined ? { roomLimit } : {}) };
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const project = await projects.create("owner", input);
      const room = newRoom(project, "fixture", newInvite(now).stored, now);
      database.rooms.set(room.id, room); owner.projects[project.id] = room.id; ids.push(project.id);
    }
    database.owners.set("owner", owner);
    return ids;
  }
  async function create() {
    const project = await projects.create("owner", input);
    return rooms.create("owner", project.id);
  }

  it("preserves fourteen existing rooms and permits exactly nine additions under a capacity of twenty-three", async () => {
    const ids = await seed(14, 23);
    for (let index = 0; index < 9; index++) await create();
    expect(database.rooms.size).toBe(23);
    const before = structuredClone(database.owners.get("owner"));
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT", message: expect.stringContaining("23-room") });
    expect(database.owners.get("owner")).toEqual(before);
    expect(database.rooms.size).toBe(23);
    expect((await rooms.create("owner", ids[0]!)).room.id).toBe(before!.projects[ids[0]!]);
    expect(database.owners.get("owner")!.roomLimit).toBe(23);
  });

  it.each([10, 100])("enforces valid capacity boundary %i without changing saved rooms", async limit => {
    await seed(limit - 1, limit); await create();
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.rooms.size).toBe(limit);
    expect(database.owners.get("owner")!.roomLimit).toBe(limit);
  });

  it.each([undefined, null, "23", true, {}, [], 9, 101, 10.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "uses the default ten-room limit for absent or invalid capacity %j", async invalid => {
      await seed(10);
      database.owners.get("owner")!.roomLimit = invalid as RoomOwner["roomLimit"];
      const before = structuredClone(database.owners.get("owner"));
      await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT", message: expect.stringContaining("10-room") });
      expect(database.rooms.size).toBe(10);
      expect(database.owners.get("owner")).toEqual(before);
    },
  );

  it("preserves server capacity through lease writes without resetting a room's spent model allowance", async () => {
    const ids = await seed(1, 23);
    const roomId = database.owners.get("owner")!.projects[ids[0]!]!;
    database.rooms.get(roomId)!.observer.callsUsed = ROOM_CALL_LIMIT - 1;
    await rooms.message("owner", roomId, { text: "Keep the included lighting.", requestId: randomUUID() });
    now += ROOM_DEBOUNCE_MS;
    const claimed = await rooms.claim(roomId);
    expect(claimed).toBeDefined();
    expect(database.owners.get("owner")!.roomLimit).toBe(23);
    await rooms.finish(roomId, claimed!.run.id, { error: "The synthetic review failed." });
    expect(database.owners.get("owner")!.active).toBeUndefined();
    expect(database.owners.get("owner")!.roomLimit).toBe(23);
    await rooms.control("owner", roomId, "retry");
    expect(await rooms.claim(roomId)).toBeUndefined();
    expect((await rooms.get("owner", roomId)).observer).toMatchObject({ status: "limit", callsUsed: ROOM_CALL_LIMIT });
  });

  it("keeps capacity private and rejects API overrides, unauthenticated requests and another owner's access", async () => {
    const ids = await seed(1, 23);
    const app = createApp({ config: readConfig({}), store: projects, rooms, provider: new FixtureProvider(), verifyToken: async token => {
      if (!["owner", "stranger"].includes(token)) throw new Error("invalid identity");
      return { uid: token };
    } });
    const projectId = ids[0]!;
    await request(app).post(`/api/projects/${projectId}/room`).send({}).expect(401);
    await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer stranger").send({}).expect(404);
    await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer owner").send({ roomLimit: 100 }).expect(422);
    const response = await request(app).post(`/api/projects/${projectId}/room`).set("Authorization", "Bearer owner").send({}).expect(200);
    expect(JSON.stringify(response.body)).not.toContain("roomLimit");
    expect(database.owners.get("owner")!.roomLimit).toBe(23);
  });
});
