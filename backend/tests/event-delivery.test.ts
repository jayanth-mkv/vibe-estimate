import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AnalysisProvider } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { ROOM_DEBOUNCE_MS, ROOM_LEASE_MS } from "../src/room-domain.js";
import { RoomObserver } from "../src/room-observer.js";
import { ROOM_DELIVERY_TIMEOUT_MS } from "../src/room-outbox.js";
import { RoomStore, type RoomTransaction } from "../src/room-store.js";
import type { Analysis, StoredProject } from "../src/types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

const settings = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "test-firebase-project", FRONTEND_ORIGIN: "https://test.example",
  GEMINI_MODEL: "gemini-test-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "test-backend-project", VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/test-backend-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-backend-project.iam.gserviceaccount.com",
  ROOM_EVENT_SERVICE_ACCOUNT: "vibeestimate-events@test-firebase-project.iam.gserviceaccount.com",
};
const analysis = (): Analysis => ({
  summary: "Display lights need a draft.", included: ["Kitchen lighting is included."], proposed: ["Display lights are requested."], questions: [],
  evidence: [{ source: "scope", quote: "Kitchen lighting: 3m LED strip included." }], provider: "gemini",
});

class CommitFailureDatabase extends MemoryRoomDatabase {
  failCommit = false;
  override transaction<T>(operation: (transaction: RoomTransaction) => Promise<T>): Promise<T> {
    return super.transaction(async transaction => {
      const value = await operation(transaction);
      if (this.failCommit) { this.failCommit = false; throw new Error("synthetic commit failure"); }
      return value;
    });
  }
}

async function setup() {
  let now = 1750000000000;
  const projects = new MemoryProjectStore();
  const database = new CommitFailureDatabase(projects);
  const rooms = new RoomStore(database, "gemini", () => now, true);
  const provider: AnalysisProvider = { kind: "gemini", analyze: vi.fn(async (_project: StoredProject) => ({ analysis: analysis(), conversation: [] })) };
  const observer = new RoomObserver(rooms, provider);
  const tasks = {
    enqueue: vi.fn(async (_id: string) => {}), enqueueDelivery: vi.fn(async (_id: string) => {}),
    verify: vi.fn(async (token: string, purpose: "task" | "event" = "task") => token === `verified-${purpose}`),
  };
  const app = createApp({ config: readConfig(settings), store: projects, rooms, provider, observer, tasks, notifyRoom: tasks.enqueue, verifyToken: async token => ({ uid: token }) });
  const project = await projects.create("owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
  const created = await rooms.create("owner", project.id);
  await rooms.join("client", created.room.id, created.inviteToken);
  return { app, database, rooms, provider, observer, tasks, id: created.room.id, advance: (ms: number) => { now += ms; } };
}
type Setup = Awaited<ReturnType<typeof setup>>;
const messageInput = (text = "Quote six display lights.") => ({ text, requestId: randomUUID() });
const postMessage = (value: Setup, input = messageInput(), token = "client") => request(value.app).post(`/api/rooms/${value.id}/messages`).set("Authorization", `Bearer ${token}`).send(input);
const control = (value: Setup, action: "retry" | "pause" | "resume", token = "owner") => request(value.app).post(`/api/rooms/${value.id}/observer`).set("Authorization", `Bearer ${token}`).send({ action });
const jobId = (value: Setup) => value.database.rooms.get(value.id)!.delivery!.id;
const eventBody = (id: string) => ({ id: `event-${id}`, source: "//firestore.googleapis.com/projects/test-firebase-project/databases/(default)", subject: `documents/roomReviewOutbox/${id}`, type: "google.cloud.firestore.document.v1.created" });
const event = (value: Setup, id: string, token = "verified-event", overrides = {}) => request(value.app).post("/internal/outbox").set("Authorization", `Bearer ${token}`).send({ ...eventBody(id), ...overrides });
const worker = (value: Setup, id: string, token = "verified-task") => request(value.app).post("/internal/observer").set("Authorization", `Bearer ${token}`).send({ deliveryId: id });

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("event-driven durable room review delivery", () => {
  it("dispatches only authenticated direct Firestore creation metadata and ignores the protobuf document", async () => {
    const value = await setup(); await postMessage(value).expect(200); const id = jobId(value);
    const headers = { "ce-id": "synthetic-event", "ce-specversion": "1.0", "ce-source": eventBody(id).source,
      "ce-type": eventBody(id).type, "ce-subject": eventBody(id).subject };
    const direct = (token = "verified-event", extra = {}) => request(value.app).post("/internal/firestore")
      .set("Authorization", `Bearer ${token}`).set("Content-Type", "application/protobuf").set({ ...headers, ...extra });
    await direct("verified-task").send(Buffer.from([10, 0])).expect(401);
    await direct("client").send(Buffer.from([10, 0])).expect(401);
    await direct("verified-event", { "ce-source": "//firestore.googleapis.com/projects/other-project/databases/(default)" }).send(Buffer.from([10, 0])).expect(422);
    await direct("verified-event", { "ce-type": "google.cloud.firestore.document.v1.updated" }).send(Buffer.from([10, 0])).expect(422);
    await direct("verified-event", { "ce-specversion": "0.3" }).send(Buffer.from([10, 0])).expect(422);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    await direct().send(Buffer.from([255, 0, 17, 128])).expect(204);
    await direct().send(Buffer.from([10, 0])).expect(204);
    expect(value.tasks.enqueueDelivery.mock.calls).toEqual([[id], [id]]);
    expect(value.provider.analyze).not.toHaveBeenCalled();
    await direct().send(Buffer.alloc(49153)).expect(413);
    await request(value.app).post("/internal/firestore").set("Authorization", "Bearer verified-event").set(headers).send(eventBody(id)).expect(422);
    expect(value.tasks.enqueueDelivery).toHaveBeenCalledTimes(2);
  });

  it("atomically saves messages and one coalesced outbox event without directly enqueuing from the API", async () => {
    const value = await setup();
    expect(value.database.deliveries.size).toBe(0);
    const input = messageInput();
    await Promise.all([postMessage(value, input).expect(200), postMessage(value, input).expect(200)]);
    const firstId = jobId(value);
    await postMessage(value, messageInput("Keep the kitchen lighting included.")).expect(200);
    expect(value.database.rooms.get(value.id)!.messages).toHaveLength(2);
    expect(jobId(value)).toBe(firstId);
    expect(value.database.deliveries.size).toBe(1);
    expect(value.database.deliveries.get(firstId)).toMatchObject({ id: firstId, roomId: value.id, ownerId: "owner", status: "pending" });
    expect(value.tasks.enqueue).not.toHaveBeenCalled();
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
    const publicRoom = await request(value.app).get(`/api/rooms/${value.id}`).set("Authorization", "Bearer owner").expect(200);
    expect(publicRoom.body.room).not.toHaveProperty("delivery");
    await postMessage(value, { ...input, text: "A changed duplicate." }).expect(409);
    expect(value.database.deliveries.size).toBe(1);
  });

  it("rolls back the staged message and outbox together when commit fails", async () => {
    const value = await setup();
    const input = messageInput();
    value.database.failCommit = true;
    await postMessage(value, input).expect(503);
    expect(value.database.rooms.get(value.id)!.messages).toEqual([]);
    expect(value.database.rooms.get(value.id)!.delivery).toBeUndefined();
    expect(value.database.deliveries.size).toBe(0);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    await postMessage(value, input).expect(200);
    expect(value.database.rooms.get(value.id)!.messages).toHaveLength(1);
    expect(value.database.deliveries.size).toBe(1);
  });

  it("denies unauthenticated and cross-user room actions before creating outbox work", async () => {
    const value = await setup();
    await request(value.app).post(`/api/rooms/${value.id}/messages`).send(messageInput()).expect(401);
    await postMessage(value, messageInput(), "stranger").expect(404);
    await control(value, "retry", "stranger").expect(404);
    expect(value.database.deliveries.size).toBe(0);
    expect(value.database.rooms.get(value.id)!.messages).toEqual([]);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it("separates event and task identities and rejects ordinary user tokens", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const id = jobId(value);
    const lookup = vi.spyOn(value.rooms, "delivery");
    await request(value.app).post("/internal/outbox").send(eventBody(id)).expect(401);
    await event(value, id, "client").expect(401);
    await event(value, id, "verified-task").expect(401);
    await worker(value, id, "verified-event").expect(401);
    expect(value.tasks.verify).toHaveBeenCalledWith("verified-task", "event");
    expect(value.tasks.verify).toHaveBeenCalledWith("verified-event", "task");
    expect(lookup).not.toHaveBeenCalled();
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it.each(["/internal/outbox/", "/internal/OUTBOX"])("requires event identity for Express route variants: %s", async path => {
    const value = await setup(); await postMessage(value).expect(200);
    const lookup = vi.spyOn(value.rooms, "delivery");
    await request(value.app).post(path).set("Authorization", "Bearer verified-task").send(eventBody(jobId(value))).expect(401);
    expect(value.tasks.verify).toHaveBeenCalledWith("verified-task", "event");
    expect(lookup).not.toHaveBeenCalled();
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it.each([
    { source: "//firestore.googleapis.com/projects/other-project/databases/(default)" },
    { source: "//firestore.googleapis.com/projects/test-firebase-project/databases/other-database" },
    { type: "google.cloud.firestore.document.v1.updated" },
    { subject: "documents/rooms/00000000-0000-4000-8000-000000000000" },
    { subject: "documents/roomReviewOutbox/not-a-uuid" },
    { subject: "documents/roomReviewOutbox/00000000-0000-4000-8000-000000000000/extra" },
    { roomId: "00000000-0000-4000-8000-000000000000" },
  ])("rejects untrusted event routing metadata: %j", async overrides => {
    const value = await setup(); await postMessage(value).expect(200);
    const lookup = vi.spyOn(value.rooms, "delivery");
    await event(value, jobId(value), "verified-event", overrides).expect(422);
    expect(lookup).not.toHaveBeenCalled();
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it("acknowledges only successful enqueue and retries the same immutable delivery after a failure", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const id = jobId(value);
    value.tasks.enqueueDelivery.mockRejectedValueOnce(new Error("synthetic task API unavailable"));
    await event(value, id).expect(503);
    expect(value.database.deliveries.get(id)!.status).toBe("pending");
    await event(value, id).expect(204);
    expect(value.tasks.enqueueDelivery.mock.calls.map(([deliveryId]) => deliveryId)).toEqual([id, id]);
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it("uses a stable ID for duplicate events and calls the model once across repeated worker deliveries", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const id = jobId(value);
    await Promise.all([event(value, id).expect(204), event(value, id).expect(204)]);
    expect(value.tasks.enqueueDelivery.mock.calls.map(([deliveryId]) => deliveryId)).toEqual([id, id]);
    await worker(value, id).expect(503);
    expect(value.provider.analyze).not.toHaveBeenCalled();
    value.advance(ROOM_DEBOUNCE_MS);
    await Promise.all([worker(value, id).expect(204), worker(value, id).expect(204)]);
    await worker(value, id).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
    expect(value.database.deliveries.get(id)!.status).toBe("completed");
    expect((await value.rooms.get("owner", value.id)).observer).toMatchObject({ status: "ready", callsUsed: 1 });
    value.tasks.enqueueDelivery.mockClear();
    await event(value, id).expect(204);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
  });

  it("makes overdue queued work visible, requires owner retry, and ignores superseded deliveries", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const oldId = jobId(value);
    value.advance(ROOM_DELIVERY_TIMEOUT_MS + 1);
    await request(value.app).get(`/api/rooms/${value.id}`).set("Authorization", "Bearer stranger").expect(404);
    expect(value.database.deliveries.get(oldId)!.status).toBe("pending");
    const failed = await request(value.app).get(`/api/rooms/${value.id}`).set("Authorization", "Bearer client").expect(200);
    expect(failed.body.room.observer).toMatchObject({ status: "error", callsUsed: 0 });
    expect(failed.body.room.observer.error).toContain("could not be started");
    expect(value.database.deliveries.get(oldId)!.status).toBe("failed");
    await control(value, "retry", "client").expect(403);
    await postMessage(value, messageInput("Another saved message after delivery failure.")).expect(200);
    expect(value.database.deliveries.size).toBe(1);
    await control(value, "retry").expect(200);
    const newId = jobId(value);
    expect(newId).not.toBe(oldId);
    expect(value.database.deliveries.size).toBe(2);
    await event(value, oldId).expect(204); await worker(value, oldId).expect(204);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
    expect(jobId(value)).toBe(newId);
    await event(value, newId).expect(204); await worker(value, newId).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
    expect((await value.rooms.get("owner", value.id)).observer.reviewedMessageCount).toBe(2);
  });

  it("turns an interrupted paid claim into an error without automatically calling the model again", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const id = jobId(value); value.advance(ROOM_DEBOUNCE_MS);
    const claim = await value.rooms.claim(value.id, id);
    expect(claim).toBeDefined();
    value.advance(ROOM_LEASE_MS + 1);
    await worker(value, id).expect(204);
    const room = await value.rooms.get("owner", value.id);
    expect(room.observer).toMatchObject({ status: "error", callsUsed: 1 });
    expect(room.observer.error).toContain("interrupted");
    expect(value.database.owners.get("owner")!.active).toBeUndefined();
    expect(value.database.deliveries.get(id)!.status).toBe("failed");
    await event(value, id).expect(204);
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
    await value.rooms.finish(value.id, claim!.run.id, { analysis: analysis() });
    expect((await value.rooms.get("owner", value.id)).observer.analysis).toBeUndefined();
  });

  it("does not let a stale worker claim a newer delivery after pause and resume races with lookup", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const oldId = jobId(value); value.advance(ROOM_DEBOUNCE_MS);
    const lookup = value.rooms.delivery.bind(value.rooms);
    vi.spyOn(value.rooms, "delivery").mockImplementationOnce(async id => {
      const oldDelivery = await lookup(id);
      await value.rooms.control("owner", value.id, "pause");
      await value.rooms.control("owner", value.id, "resume");
      return oldDelivery;
    });
    await worker(value, oldId).expect(204);
    const newId = jobId(value);
    expect(newId).not.toBe(oldId);
    expect(value.provider.analyze).not.toHaveBeenCalled();
    expect(value.database.deliveries.get(newId)!.status).toBe("pending");
    await worker(value, newId).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
  });

  it("does not create a fresh event automatically after a failed model call", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const oldId = jobId(value); value.advance(ROOM_DEBOUNCE_MS);
    vi.mocked(value.provider.analyze).mockRejectedValueOnce(new Error("private provider failure"));
    await worker(value, oldId).expect(204);
    expect(value.database.deliveries.get(oldId)!.status).toBe("failed");
    const failed = await value.rooms.get("owner", value.id);
    expect(failed.observer).toMatchObject({ status: "error", callsUsed: 1 });
    expect(failed.observer.error).not.toContain("private provider failure");
    await postMessage(value, messageInput("A later saved message.")).expect(200);
    await event(value, oldId).expect(204); await worker(value, oldId).expect(204);
    expect(value.database.deliveries.size).toBe(1);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
    await control(value, "retry").expect(200);
    expect(value.database.deliveries.size).toBe(2);
    expect(jobId(value)).not.toBe(oldId);
    await worker(value, jobId(value)).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(2);
  });

  it("gives a message arriving during generation a fresh delivery ID and deadline near the old event expiry", async () => {
    const value = await setup(); await postMessage(value).expect(200);
    const id = jobId(value);
    const oldDeadline = value.database.deliveries.get(id)!.deadline;
    value.advance(ROOM_DELIVERY_TIMEOUT_MS - 60_000);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(value.provider.analyze).mockImplementationOnce(async () => { await gate; return { analysis: analysis(), conversation: [] }; });
    const first = worker(value, id).then(response => response);
    try {
      await vi.waitFor(() => { expect(value.provider.analyze).toHaveBeenCalledTimes(1); });
      value.advance(20_000);
      await postMessage(value, messageInput("Revise the draft to four display lights.")).expect(200);
    } finally { release(); }
    const response = await first;
    const followupId = jobId(value);
    expect(response.status).toBe(204);
    expect(followupId).not.toBe(id);
    expect(value.database.deliveries.get(id)!.status).toBe("completed");
    const followup = value.database.deliveries.get(followupId)!;
    expect(followup.status).toBe("pending");
    expect(followup.deadline).toBe(followup.createdAt + ROOM_DELIVERY_TIMEOUT_MS);
    expect(followup.deadline).toBeGreaterThan(oldDeadline);
    expect(followup.createdAt).toBe(Date.parse(value.database.rooms.get(value.id)!.updatedAt));
    expect((await value.rooms.get("owner", value.id)).observer).toMatchObject({ status: "queued", callsUsed: 1, reviewedMessageCount: 0 });
    value.advance(40_001); // The first event is now past its original deadline.
    await worker(value, id).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(1);
    expect((await value.rooms.get("owner", value.id)).observer.status).toBe("queued");
    await event(value, followupId).expect(204);
    expect(value.tasks.enqueueDelivery).toHaveBeenCalledWith(followupId);
    await worker(value, followupId).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(2);
    expect(vi.mocked(value.provider.analyze).mock.calls[1]![0].messages).toContain("Revise the draft to four display lights.");
    expect((await value.rooms.get("owner", value.id)).observer).toMatchObject({ status: "ready", reviewedMessageCount: 2 });
    expect(value.database.rooms.get(value.id)!.snapshots).toHaveLength(2);
    await worker(value, id).expect(204);
    expect(value.provider.analyze).toHaveBeenCalledTimes(2);
  });

  it.each(["paused", "home"])("does not create a review job for a %s room", async state => {
    const value = await setup();
    if (state === "paused") await control(value, "pause").expect(200);
    else await value.rooms.attachHome("owner", value.id, randomUUID());
    await postMessage(value).expect(200);
    expect(value.database.rooms.get(value.id)!.messages).toHaveLength(1);
    expect(value.database.deliveries.size).toBe(0);
    expect(value.tasks.enqueue).not.toHaveBeenCalled();
    expect(value.tasks.enqueueDelivery).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
  });
});
