import { createApp } from "./app.js";
import { createProvider } from "./ai.js";
import { readConfig } from "./config.js";
import { FirestoreProjectStore } from "./store.js";
import { FirestoreRoomDatabase, RoomStore } from "./room-store.js";
import { RoomObserver } from "./room-observer.js";
import { apiHost, createFirebaseRuntime } from "./firebase-runtime.js";
import { createRoomTasks } from "./room-tasks.js";
import { createHomeProvider } from "./home-ai.js";
import { FirestoreHomeDatabase, HomeStore } from "./home-store.js";
import { HomeService } from "./home-service.js";
import { FirestoreHomeCollaborationDatabase, HomeCollaboration } from "./home-collaboration.js";

const config = readConfig(process.env);
if (config.appEnv === "local") {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = config.authEmulatorHost;
  process.env.FIRESTORE_EMULATOR_HOST = config.firestoreEmulatorHost;
  process.env.GCLOUD_PROJECT = config.projectId;
}
const { firestore, verifyToken, sessionMigration } = createFirebaseRuntime(config);
const store = new FirestoreProjectStore(firestore);
const provider = createProvider(config);
const rooms = new RoomStore(new FirestoreRoomDatabase(firestore), provider.kind, Date.now, Boolean(config.eventServiceAccount));
const observer = new RoomObserver(rooms, provider);
const tasks = config.appEnv === "production" ? createRoomTasks(config) : undefined;
const homes = new HomeService(new HomeStore(new FirestoreHomeDatabase(firestore)), createHomeProvider(config), store);
const homeCollaboration = new HomeCollaboration(new FirestoreHomeCollaborationDatabase(firestore), homes, rooms);
const app = createApp({ config, store, provider, rooms, homes, homeCollaboration, verifyToken, sessionMigration, observer, tasks, notifyRoom: tasks ? id => tasks.enqueue(id) : async () => { observer.notify(); } });
const host = apiHost(config);
const server = app.listen(config.port, host, () => {
  console.info(JSON.stringify({ event: "server_ready", port: config.port, mode: config.appEnv, aiProvider: config.aiProvider }));
});
if (config.appEnv !== "production") observer.start();
const shutdown = () => {
  observer.stop();
  server.close(() => { void observer.idle().finally(() => firestore.terminate()).finally(() => process.exit(0)); });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
