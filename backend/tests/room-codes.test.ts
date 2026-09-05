import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { FixtureProvider } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { ROOM_INVITE_MS } from "../src/room-domain.js";
import { RoomStore } from "../src/room-store.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

describe("authenticated room-code invitations", () => {
  let database: MemoryRoomDatabase;
  let rooms: RoomStore;
  let app: ReturnType<typeof createApp>;
  let now: number;
  beforeEach(() => {
    now = 1750000000000;
    const projects = new MemoryProjectStore();
    database = new MemoryRoomDatabase(projects);
    rooms = new RoomStore(database, "fixture", () => now);
    app = createApp({ config: readConfig({}), store: projects, provider: new FixtureProvider(), rooms, verifyToken: async token => {
      if (!["owner", "client", "stranger"].includes(token)) throw new Error("invalid identity");
      return { uid: token };
    } });
  });
  const post = (path: string, body: unknown = {}, uid = "owner") => request(app).post(path).set("Authorization", `Bearer ${uid}`).send(body);
  const join = (code: string, uid = "client") => post("/api/rooms/join", { joinCode: code }, uid);
  const create = async () => {
    const project = await database.projects.create("owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
    const response = await post(`/api/projects/${project.id}/room`).expect(200);
    return response.body as { room: { id: string }; inviteToken: string; joinCode: string };
  };

  it("returns a readable random code while persisting hashes only and derives the joined client's role", async () => {
    const invitation = await create();
    expect(invitation.joinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const stored = database.rooms.get(invitation.room.id)!;
    expect(stored.invite.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(invitation.joinCode);
    expect(JSON.stringify(stored)).not.toContain(invitation.joinCode.replaceAll("-", ""));
    expect(JSON.stringify(stored)).not.toContain(invitation.inviteToken);
    const response = await join(invitation.joinCode.toLowerCase().replaceAll("-", " ")).expect(200);
    expect(response.body.room).toMatchObject({ id: invitation.room.id, role: "client", clientJoined: true, observer: { callsUsed: 0 } });
    for (const value of [response.body.room, invitation.room]) {
      expect(value.invite).toBeUndefined();
      expect(value.joinCode).toBeUndefined();
      expect(value.codeHash).toBeUndefined();
    }
    await join(invitation.joinCode.replaceAll("-", "")).expect(200);
    expect(database.rooms.get(invitation.room.id)!.clientId).toBe("client");
  });

  it("requires identity and a valid code; UUIDs, forged roles and unbounded input do not authorize joining", async () => {
    const invitation = await create();
    await request(app).post("/api/rooms/join").send({ joinCode: invitation.joinCode }).expect(401);
    await post("/api/rooms/join", { joinCode: invitation.joinCode }, "invalid").expect(401);
    await post("/api/rooms/join", { joinCode: invitation.joinCode, role: "designer" }, "client").expect(422);
    await post("/api/rooms/join", { joinCode: invitation.joinCode, ownerId: "owner" }, "client").expect(422);
    for (const input of [invitation.room.id, "A".repeat(33), "../room", "IIII-OOOO-UUUU", "", "AAAA-BBBB-CCCC" + " ".repeat(32)]) await join(input).expect(422);
    await join("0000-0000-0000").expect(403);
    expect((await join(invitation.joinCode, "owner").expect(403)).body.error.code).toBe("CLIENT_IDENTITY_REQUIRED");
    expect(database.rooms.get(invitation.room.id)!.clientId).toBeUndefined();
  });

  it("rotates both invitation secrets, expires codes and keeps bound clients after invitation expiry", async () => {
    const first = await create();
    const rotated = (await post(`/api/rooms/${first.room.id}/invite`).expect(200)).body;
    expect(rotated.joinCode).not.toBe(first.joinCode);
    expect(rotated.inviteToken).not.toBe(first.inviteToken);
    await join(first.joinCode).expect(403);
    await post(`/api/rooms/${first.room.id}/join`, { inviteToken: first.inviteToken }, "client").expect(403);
    await join(rotated.joinCode).expect(200);
    await post(`/api/rooms/${first.room.id}/invite`, {}, "client").expect(403);
    expect((await join(rotated.joinCode, "stranger").expect(403)).body.error.code).toBe("ROOM_FULL");
    now += ROOM_INVITE_MS;
    expect((await join(rotated.joinCode).expect(403)).body.error.code).toBe("INVITE_INVALID");
    expect((await rooms.get("client", first.room.id)).role).toBe("client");
  });

  it("rechecks the current hash inside the binding transaction after a concurrent rotation", async () => {
    const invitation = await create();
    const original = database.findRoomByJoinCodeHash.bind(database);
    vi.spyOn(database, "findRoomByJoinCodeHash").mockImplementationOnce(async hash => {
      const id = await original(hash);
      await rooms.invite("owner", invitation.room.id);
      return id;
    });
    await join(invitation.joinCode).expect(403);
    expect(database.rooms.get(invitation.room.id)!.clientId).toBeUndefined();
  });

  it("binds one client under simultaneous code joins and safely replays only that client's membership", async () => {
    const invitation = await create();
    const results = await Promise.all([join(invitation.joinCode, "client"), join(invitation.joinCode, "stranger")]);
    expect(results.map(value => value.status).sort()).toEqual([200, 403]);
    const winner = database.rooms.get(invitation.room.id)!.clientId!;
    const loser = winner === "client" ? "stranger" : "client";
    await join(invitation.joinCode, winner).expect(200);
    await join(invitation.joinCode, loser).expect(403);
    await expect(rooms.get(loser, invitation.room.id)).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
    expect(database.rooms.get(invitation.room.id)!.observer.callsUsed).toBe(0);
  });

  it("preserves legacy long-token invitations until rotation adds a code", async () => {
    const invitation = await create();
    delete database.rooms.get(invitation.room.id)!.invite.codeHash;
    await join(invitation.joinCode).expect(403);
    await post(`/api/rooms/${invitation.room.id}/join`, { inviteToken: invitation.inviteToken }, "client").expect(200);
    const rotated = (await post(`/api/rooms/${invitation.room.id}/invite`).expect(200)).body;
    await join(rotated.joinCode).expect(200);
    expect(database.rooms.get(invitation.room.id)!.clientId).toBe("client");
  });
});
