import { randomUUID } from "node:crypto";
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth as AdminAuth } from "firebase-admin/auth";
import { Firestore } from "firebase-admin/firestore";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithCustomToken, signOut, type Auth } from "firebase/auth";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { createSessionMigration, readFirebaseMigration } from "../backend/src/firebase-migration.js";
import { readConfig } from "../backend/src/config.js";
import { isGuestUser } from "../frontend/src/lib/firebase.js";

const sourceProject = "demo-vibeestimate-legacy";
const targetProject = "demo-vibeestimate-migration";
const sourceHost = "127.0.0.1:9399";
const targetHost = "127.0.0.1:9299";
const firestoreHost = "127.0.0.1:8285";
const snapshotSha256 = "a".repeat(64);
const clients: { app: FirebaseApp; auth: Auth }[] = [];
const ownedUsers: { auth: AdminAuth; uid: string }[] = [];
const ownedDocuments = new Set<string>();
let sourceApp: AdminApp;
let targetApp: AdminApp;
let sourceAdmin: AdminAuth;
let targetAdmin: AdminAuth;
let db: Firestore;

beforeAll(() => {
  // Dedicated ports exclude both ordinary development and its shared demo state.
  // Never read credentials or let a missing emulator setting fall back to Google.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== targetHost
    || process.env.FIREBASE_MIGRATION_SOURCE_AUTH_EMULATOR_HOST !== sourceHost
    || process.env.FIRESTORE_EMULATOR_HOST !== firestoreHost) {
    throw new Error("Migration SDK tests require isolated Auth 9299/9399 and Firestore 8285 on 127.0.0.1.");
  }
  const fixtureCredential = { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) };
  sourceApp = initializeAdminApp({ projectId: sourceProject, credential: fixtureCredential,
    serviceAccountId: `migration-test@${sourceProject}.iam.gserviceaccount.com` }, "migration-source-" + randomUUID());
  targetApp = initializeAdminApp({ projectId: targetProject, credential: fixtureCredential,
    serviceAccountId: `migration-test@${targetProject}.iam.gserviceaccount.com` }, "migration-target-" + randomUUID());
  // Admin Auth captures its emulator host when the per-app Auth instance is
  // initialized. Both clients then keep their own endpoint; no live SDK is used.
  try {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = sourceHost;
    sourceAdmin = getAdminAuth(sourceApp);
  } finally { process.env.FIREBASE_AUTH_EMULATOR_HOST = targetHost; }
  targetAdmin = getAdminAuth(targetApp);
  // The direct Firestore SDK accepts explicit emulator transport without
  // requiring the Admin wrapper's certificate/ADC credential classification.
  db = new Firestore({ projectId: targetProject, host: firestoreHost, ssl: false });
});

afterEach(async () => {
  for (const client of clients.splice(0)) { await signOut(client.auth); await deleteApp(client.app); }
  for (const name of ownedDocuments) {
    if (!/^firebaseMigrationUsers\/[^/]+$/.test(name)) throw new Error("Fixture cleanup escaped its owned mapping.");
    await db.doc(name).delete();
  }
  ownedDocuments.clear();
  for (const user of ownedUsers.splice(0)) await user.auth.deleteUser(user.uid);
});
afterAll(async () => {
  await db?.terminate();
  if (sourceApp) await deleteAdminApp(sourceApp);
  if (targetApp) await deleteAdminApp(targetApp);
});

function client(project: string, host: string): Auth {
  if (![[sourceProject, sourceHost], [targetProject, targetHost]].some(([expectedProject, expectedHost]) => project === expectedProject && host === expectedHost)) {
    throw new Error("Unapproved migration fixture target.");
  }
  const app = initializeApp({ projectId: project, apiKey: "demo-migration-key", authDomain: project + ".firebaseapp.com" }, "migration-browser-" + randomUUID());
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://" + host, { disableWarnings: true });
  clients.push({ app, auth });
  return auth;
}

function bridge() {
  return createSessionMigration({ sourceProjectId: sourceProject, snapshotSha256 }, {
    verifySource: token => sourceAdmin.verifyIdToken(token, true),
    mapping: async uid => (await db.doc(`firebaseMigrationUsers/${uid}`).get()).data(),
    targetUser: uid => targetAdmin.getUser(uid),
    createToken: uid => targetAdmin.createCustomToken(uid),
  });
}

async function importedGuest() {
  const sourceBrowser = client(sourceProject, sourceHost);
  const targetBrowser = client(targetProject, targetHost);
  const source = await signInAnonymously(sourceBrowser);
  ownedUsers.push({ auth: sourceAdmin, uid: source.user.uid });
  expect(source.user.isAnonymous).toBe(true);
  // Exercise the actual providerless import and supported metadata contract.
  await sourceAdmin.setCustomUserClaims(source.user.uid, { fixtureAccess: "retained" });
  const original = await sourceAdmin.getUser(source.user.uid);
  const imported = await targetAdmin.importUsers([{
    uid: original.uid, disabled: original.disabled, providerData: original.providerData,
    customClaims: original.customClaims,
    metadata: { creationTime: original.metadata.creationTime, lastSignInTime: original.metadata.lastSignInTime },
  }]);
  expect(imported.failureCount).toBe(0);
  expect(imported.successCount).toBe(1);
  ownedUsers.push({ auth: targetAdmin, uid: original.uid });
  const target = await targetAdmin.getUser(original.uid);
  expect(target.uid).toBe(original.uid);
  expect(target.providerData).toEqual([]);
  expect(target.customClaims).toEqual(original.customClaims);
  expect(target.metadata.creationTime).toBe(original.metadata.creationTime);
  expect(target.metadata.lastSignInTime).toBe(original.metadata.lastSignInTime);
  const name = `firebaseMigrationUsers/${original.uid}`;
  await db.doc(name).create({ sourceProjectId: sourceProject, sourceUid: original.uid, targetUid: original.uid, snapshotSha256 });
  ownedDocuments.add(name);
  const token = await source.user.getIdToken(true);
  expect((await sourceAdmin.verifyIdToken(token, true)).aud).toBe(sourceProject);
  return { sourceBrowser, targetBrowser, source: source.user, token, uid: original.uid, mapping: db.doc(name) };
}

test("real imported guest exchanges its source token for a target session with the same UID and guest recovery behavior", async () => {
  const fixture = await importedGuest();
  const exchanged = await bridge().exchange(fixture.token);
  expect(exchanged.uid).toBe(fixture.uid);
  const signedIn = await signInWithCustomToken(fixture.targetBrowser, exchanged.customToken);
  expect(signedIn.user.uid).toBe(fixture.uid);
  const targetToken = await signedIn.user.getIdToken();
  const verified = await targetAdmin.verifyIdToken(targetToken, true);
  expect(verified.uid).toBe(fixture.uid);
  expect(verified.aud).toBe(targetProject);
  expect(verified.fixtureAccess).toBe("retained");
  // Firebase labels a custom-token session non-anonymous, even when its account
  // has no recovery provider. Product guest detection must retain that distinction.
  expect(signedIn.user.isAnonymous).toBe(false);
  expect(signedIn.user.providerData).toEqual([]);
  expect(isGuestUser(signedIn.user)).toBe(true);
  expect(fixture.sourceBrowser.currentUser?.uid).toBe(fixture.uid);
  await expect(sourceAdmin.verifyIdToken(targetToken, true)).rejects.toMatchObject({ code: "auth/argument-error" });
});

test("real SDK project verification denies target tokens on the source-only exchange", async () => {
  const fixture = await importedGuest();
  const exchanged = await bridge().exchange(fixture.token);
  const signedIn = await signInWithCustomToken(fixture.targetBrowser, exchanged.customToken);
  await expect(bridge().exchange(await signedIn.user.getIdToken())).rejects.toMatchObject({ status: 401, code: "MIGRATION_AUTH_REQUIRED" });
});

test("real source refresh-token revocation invalidates the previously issued ID token before migration", async () => {
  const fixture = await importedGuest();
  // Revocation timestamps have second precision. Ensure the token predates the
  // real SDK revoke operation rather than relying on a same-second race.
  await new Promise(resolve => setTimeout(resolve, 1100));
  await sourceAdmin.revokeRefreshTokens(fixture.uid);
  await expect(sourceAdmin.verifyIdToken(fixture.token, true)).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  await expect(bridge().exchange(fixture.token)).rejects.toMatchObject({ status: 401, code: "MIGRATION_AUTH_REQUIRED" });
  expect(fixture.targetBrowser.currentUser).toBeNull();
});

test("real destination lookup refuses a disabled imported UID and a mapping outside the reviewed snapshot", async () => {
  const fixture = await importedGuest();
  await targetAdmin.updateUser(fixture.uid, { disabled: true });
  await expect(bridge().exchange(fixture.token)).rejects.toMatchObject({ status: 403, code: "MIGRATION_NOT_READY" });
  await targetAdmin.updateUser(fixture.uid, { disabled: false });
  await fixture.mapping.update({ snapshotSha256: "b".repeat(64) });
  await expect(bridge().exchange(fixture.token)).rejects.toMatchObject({ status: 403, code: "MIGRATION_NOT_READY" });
  expect(fixture.targetBrowser.currentUser).toBeNull();
});

test("admitting demo mapping fixtures does not admit demo projects through production configuration", () => {
  const configuration = { projectId: targetProject, appNamespace: "migrated", migrationSnapshotSha256: snapshotSha256, legacy: { projectId: sourceProject } };
  expect(() => readFirebaseMigration(JSON.stringify(configuration), targetProject, "production")).toThrow("distinct verified production projects");
  const production = {
    APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "target-project", FRONTEND_ORIGIN: "https://example.invalid",
    GEMINI_MODEL: "synthetic-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "target-project", VERTEX_LOCATION: "global",
    ROOM_TASK_QUEUE: "projects/target-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@target-project.iam.gserviceaccount.com",
  };
  expect(() => readConfig(production)).not.toThrow();
  expect(() => readConfig({ ...production, FIREBASE_PROJECT_ID: targetProject })).toThrow();
  expect(() => readConfig({ ...production, FIREBASE_WEB_CONFIG: JSON.stringify(configuration) })).toThrow();
});
