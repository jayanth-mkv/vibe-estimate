import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AnalysisProvider } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { ROOM_DEBOUNCE_MS, ROOM_LEASE_MS } from "../src/room-domain.js";
import { RoomObserver } from "../src/room-observer.js";
import { RoomStore } from "../src/room-store.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

const settings = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "test-firebase-project", FRONTEND_ORIGIN: "https://test.example",
  GEMINI_MODEL: "gemini-test-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "test-backend-project", VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/test-backend-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-backend-project.iam.gserviceaccount.com",
};

async function setup() {
  let now = Date.now();
  const projects = new MemoryProjectStore();
  const database = new MemoryRoomDatabase(projects);
  const rooms = new RoomStore(database, "gemini", () => now);
  const provider: AnalysisProvider = { kind: "gemini", analyze: vi.fn(async () => ({ analysis: {
    summary: "Display lights need a draft.", included: ["Kitchen lighting is included."], proposed: ["Display lights are requested."], questions: [],
    evidence: [{ source: "scope" as const, quote: "Kitchen lighting: 3m LED strip included." }], provider: "gemini" as const,
  }, conversation: [] })) };
  const observer = new RoomObserver(rooms, provider);
  const tasks = { enqueue: vi.fn(async (_id: string) => {}), enqueueDelivery: vi.fn(async (_id: string) => {}), verify: vi.fn(async (token: string) => token === "verified-delivery") };
  const app = createApp({ config: readConfig(settings), store: projects, rooms, provider, observer, tasks, notifyRoom: tasks.enqueue, verifyToken: async token => ({ uid: token }) });
  const project = await projects.create("owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
  const created = await rooms.create("owner", project.id);
  await rooms.join("client", created.room.id, created.inviteToken);
  return { app, rooms, provider, tasks, id: created.room.id, advance: (ms: number) => { now += ms; } };
}
const task = (app: ReturnType<typeof createApp>, id: string, token = "verified-delivery") => request(app).post("/internal/observer").set("Authorization", `Bearer ${token}`).send({ roomId: id });

describe("production managed room reviews", () => {
  it("requires explicit runtime credentials and managed delivery configuration", () => {
    expect(readConfig(settings).vertexAuthMode).toBe("runtime");
    for (const overrides of [{ VERTEX_AUTH_MODE: "named-profile" }, { VERTEX_GCLOUD_ACCOUNT: "private@example.test" }, { GOOGLE_APPLICATION_CREDENTIALS: "private.json" }, { ROOM_TASK_QUEUE: "" }, { FIRESTORE_EMULATOR_HOST: "localhost:8085" }]) {
      expect(() => readConfig({ ...settings, ...overrides })).toThrow();
    }
  });
  it("rejects guest/user tokens on internal workers before reading or calling a model", async () => {
    const value = await setup();
    await task(value.app, value.id, "client").expect(401);
    await request(value.app).post("/internal/reconcile").expect(401);
    expect(value.provider.analyze).not.toHaveBeenCalled(); expect(value.tasks.enqueue).not.toHaveBeenCalled();
  });
  it("saves before enqueuing, respects debounce, and deduplicates repeated task delivery", async () => {
    const value = await setup();
    await request(value.app).post(`/api/rooms/${value.id}/messages`).set("Authorization", "Bearer client").send({ text: "Quote six display lights.", requestId: randomUUID() }).expect(200);
    expect(value.tasks.enqueue).toHaveBeenCalledWith(value.id);
    await task(value.app, value.id).expect(503);
    expect(value.provider.analyze).not.toHaveBeenCalled();
    value.advance(ROOM_DEBOUNCE_MS);
    await Promise.all([task(value.app, value.id), task(value.app, value.id)]);
    await task(value.app, value.id).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
    expect((await value.rooms.get("owner", value.id)).observer.status).toBe("ready");
  });
  it("recovers a saved queue entry after enqueue fails and does not repeat an interrupted paid review", async () => {
    const value = await setup();
    value.tasks.enqueue.mockRejectedValueOnce(new Error("upstream private details"));
    await request(value.app).post(`/api/rooms/${value.id}/messages`).set("Authorization", "Bearer client").send({ text: "Quote six display lights.", requestId: randomUUID() }).expect(200);
    expect((await value.rooms.get("owner", value.id)).messages).toHaveLength(1);
    await request(value.app).post("/internal/reconcile").set("Authorization", "Bearer verified-delivery").expect(204);
    expect(value.tasks.enqueue).toHaveBeenCalledTimes(2);
    value.advance(ROOM_DEBOUNCE_MS);
    await value.rooms.claim(value.id); // A worker dies after reserving its paid call.
    value.advance(ROOM_LEASE_MS + 1);
    await task(value.app, value.id).expect(204);
    expect(value.provider.analyze).not.toHaveBeenCalled();
    expect((await value.rooms.get("owner", value.id)).observer.status).toBe("error");
  });
});
