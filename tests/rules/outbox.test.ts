import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { beforeAll, afterAll, expect, test } from "vitest";
import { FirestoreRoomDatabase, RoomStore } from "../../backend/src/room-store.js";
import { newProject } from "../../backend/src/store.js";
import { FIXTURE_NAME, FIXTURE_SCOPE, FIXTURE_MESSAGES } from "../../backend/src/fixtures.js";

let app: App;
let db: Firestore;
beforeAll(() => {
  if (!["127.0.0.1:8085", "127.0.0.1:8285"].includes(process.env.FIRESTORE_EMULATOR_HOST ?? "")) throw new Error("Outbox persistence tests require an admitted demo emulator.");
  app = initializeApp({ projectId: "demo-vibeestimate" }, "outbox-" + randomUUID());
  db = getFirestore(app);
});
afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });

async function setup() {
  const uid = "outbox-test-" + randomUUID();
  const project = newProject(uid, { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
  await db.doc(`users/${uid}/projects/${project.id}`).set(project);
  const database = new FirestoreRoomDatabase(db);
  const store = new RoomStore(database, "fixture", Date.now, true);
  const created = await store.create(uid, project.id);
  return { uid, database, store, id: created.room.id };
}

test("real Firestore commits one delivery with the message and preserves it across store restart", async () => {
  const { uid, store, id } = await setup();
  const input = { text: "Quote six display lights.", requestId: randomUUID() };
  await store.message(uid, id, input);
  const restarted = new RoomStore(new FirestoreRoomDatabase(db), "fixture", Date.now, true);
  await restarted.message(uid, id, input);
  await restarted.message(uid, id, { ...input, requestId: randomUUID() });
  const jobs = await db.collection("roomReviewOutbox").where("roomId", "==", id).get();
  expect(jobs.size).toBe(1);
  expect(await restarted.delivery(jobs.docs[0]!.id)).toMatchObject({ roomId: id, ownerId: uid, status: "pending" });
  expect((await restarted.get(uid, id)).messages).toHaveLength(2);
});

test("real Firestore rolls back message and outbox together if their transaction fails", async () => {
  const { uid, database, store, id } = await setup();
  const transaction = database.transaction.bind(database);
  database.transaction = operation => transaction(async tx => { await operation(tx); throw new Error("injected commit failure"); });
  await expect(store.message(uid, id, { text: "Quote six display lights.", requestId: randomUUID() })).rejects.toThrow("injected");
  expect((await db.doc(`rooms/${id}`).get()).data()!.messages).toHaveLength(0);
  expect((await db.collection("roomReviewOutbox").where("roomId", "==", id).get()).size).toBe(0);
});
