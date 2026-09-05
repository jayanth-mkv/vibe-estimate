import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createApp } from "./app.js";
import { createProvider } from "./ai.js";
import { readConfig } from "./config.js";
import { FirestoreProjectStore } from "./store.js";

const config = readConfig(process.env);
if (config.appEnv === "local") {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = config.authEmulatorHost;
  process.env.FIRESTORE_EMULATOR_HOST = config.firestoreEmulatorHost;
  process.env.GCLOUD_PROJECT = config.projectId;
}
const firebase = initializeApp({ projectId: config.projectId, ...(config.appEnv === "production" ? { credential: applicationDefault() } : {}) });
const firestore = getFirestore(firebase, config.firestoreDatabaseId);
const store = new FirestoreProjectStore(firestore);
const provider = createProvider(config);
const app = createApp({ config, store, provider, verifyToken: token => getAuth(firebase).verifyIdToken(token) });
const host = config.appEnv === "local" ? "127.0.0.1" : "0.0.0.0";
const server = app.listen(config.port, host, () => {
  console.info(JSON.stringify({ event: "server_ready", port: config.port, mode: config.appEnv, aiProvider: config.aiProvider }));
});
process.on("SIGTERM", () => server.close(() => { void firestore.terminate().finally(() => process.exit(0)); }));
process.on("SIGINT", () => server.close(() => { void firestore.terminate().finally(() => process.exit(0)); }));
