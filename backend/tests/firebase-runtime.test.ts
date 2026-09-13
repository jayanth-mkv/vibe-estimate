import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { readConfig } from "../src/config.js";
import { apiHost, createFirebaseRuntime } from "../src/firebase-runtime.js";

const calls = vi.hoisted(() => ({ initialize: vi.fn(), adc: vi.fn(), adminFirestore: vi.fn(), directFirestore: vi.fn(), verify: vi.fn(), sourceVerify: vi.fn(), getUser: vi.fn(), mint: vi.fn() }));
vi.mock("firebase-admin/app", () => ({ initializeApp: calls.initialize, applicationDefault: calls.adc }));
vi.mock("firebase-admin/auth", () => ({ getAuth: (app: { name: string }) => app.name === "migration-source"
  ? { verifyIdToken: calls.sourceVerify }
  : { verifyIdToken: calls.verify, getUser: calls.getUser, createCustomToken: calls.mint } }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: calls.adminFirestore, Firestore: class { constructor(options: unknown) { calls.directFirestore(options); } } }));

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GOOGLE_CLOUD_QUOTA_PROJECT", "unrelated-inherited-project"); calls.initialize.mockReturnValue({ name: "synthetic-app" }); calls.verify.mockResolvedValue({ uid: "synthetic-user" }); });
afterEach(() => { vi.unstubAllEnvs(); });
const connected = () => readConfig({
  APP_ENV: "connected", AI_PROVIDER: "gemini", FRONTEND_ORIGIN: "http://127.0.0.1:3000", FIREBASE_PROJECT_ID: "synthetic-firebase-project", FIRESTORE_DATABASE_ID: "(default)",
  CONNECTED_AUTH_PROJECT_ID: "synthetic-backend-project", CONNECTED_AUTH_GCLOUD_CONFIGURATION: "synthetic-owner", CONNECTED_AUTH_GCLOUD_ACCOUNT: "owner@example.test", CONNECTED_AUTH_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud"),
  GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-3.7-flash", VERTEX_PROJECT_ID: "synthetic-backend-project", VERTEX_LOCATION: "global", VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner", VERTEX_GCLOUD_ACCOUNT: "owner@example.test", VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud")
});
describe("Firebase runtime routing", () => {
  it("constructs real Auth and direct Firestore with explicit credentials and no ADC or premature token calls", async () => {
    const obtain = vi.fn();
    const config = connected();
    const runtime = createFirebaseRuntime(config, { obtain, env: {} });
    expect(calls.adc).not.toHaveBeenCalled();
    expect(calls.adminFirestore).not.toHaveBeenCalled();
    expect(obtain).not.toHaveBeenCalled();
    expect(calls.initialize.mock.calls[0]![0]).toMatchObject({ projectId: config.projectId, credential: { getAccessToken: expect.any(Function) } });
    expect(calls.directFirestore.mock.calls[0]![0]).toMatchObject({ projectId: config.projectId, databaseId: "(default)", authClient: expect.any(OAuth2Client) });
    expect(process.env.GOOGLE_CLOUD_QUOTA_PROJECT).toBe(config.projectId);
    expect(process.env.GOOGLE_CLOUD_QUOTA_PROJECT).not.toBe(config.connectedAuthProjectId);
    expect(apiHost(config)).toBe("127.0.0.1");
    await runtime.verifyToken("synthetic-id-token");
    expect(calls.verify).toHaveBeenCalledWith("synthetic-id-token", true);
    calls.verify.mockRejectedValueOnce(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    await expect(runtime.verifyToken("synthetic-revoked-token")).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });
  it("keeps emulator SDK routing and reserves ADC/listening on all interfaces for explicit production", async () => {
    const local = readConfig({});
    createFirebaseRuntime(local);
    expect(calls.adc).not.toHaveBeenCalled();
    expect(calls.adminFirestore).toHaveBeenCalledTimes(1);
    expect(calls.directFirestore).not.toHaveBeenCalled();
    expect(apiHost(local)).toBe("127.0.0.1");
    expect(process.env.GOOGLE_CLOUD_QUOTA_PROJECT).toBe("unrelated-inherited-project");
    const production = readConfig({ APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "synthetic-production-project", FRONTEND_ORIGIN: "https://example.test", GEMINI_API_KEY: "synthetic-key", GEMINI_MODEL: "synthetic-model", ROOM_TASK_QUEUE: "projects/test-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-project.iam.gserviceaccount.com" });
    const runtime = createFirebaseRuntime(production);
    expect(calls.adc).toHaveBeenCalledTimes(1);
    expect(apiHost(production)).toBe("0.0.0.0");
    expect(process.env.GOOGLE_CLOUD_QUOTA_PROJECT).toBe("unrelated-inherited-project");
    await runtime.verifyToken("synthetic-production-token");
    expect(calls.verify).toHaveBeenLastCalledWith("synthetic-production-token", true);
    calls.verify.mockResolvedValueOnce({ uid: "synthetic-user", firebase: { tenant: "another-tenant" } });
    await expect(runtime.verifyToken("synthetic-tenant-token")).rejects.toMatchObject({ code: "auth/tenant-id-mismatch" });
  });
  it("verifies legacy revocation in the source project and signs only the allowlisted imported UID in the target", async () => {
    const sourceProjectId = "synthetic-source-project";
    const targetProjectId = "synthetic-target-project";
    const snapshotSha256 = "a".repeat(64);
    const mapping = { sourceProjectId, sourceUid: "imported-user", targetUid: "imported-user", snapshotSha256 };
    const get = vi.fn(async () => ({ data: () => mapping }));
    const doc = vi.fn(() => ({ get }));
    const collection = vi.fn(() => ({ doc }));
    calls.initialize.mockImplementation((_options, name) => ({ name: name ?? "[DEFAULT]" }));
    calls.adminFirestore.mockReturnValue({ collection });
    calls.sourceVerify.mockResolvedValue({ uid: "imported-user" });
    calls.getUser.mockResolvedValue({ uid: "imported-user", disabled: false });
    calls.mint.mockResolvedValue("synthetic-custom-token");
    const config = readConfig({
      APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: targetProjectId,
      FRONTEND_ORIGIN: "https://example.test", GEMINI_API_KEY: "synthetic-key", GEMINI_MODEL: "synthetic-model",
      ROOM_TASK_QUEUE: "projects/test-project/locations/asia-southeast1/queues/reviews",
      ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-project.iam.gserviceaccount.com",
      FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: targetProjectId, appNamespace: "migrated", legacy: { projectId: sourceProjectId }, migrationSnapshotSha256: snapshotSha256 }),
    });
    const runtime = createFirebaseRuntime(config);
    expect(calls.initialize).toHaveBeenNthCalledWith(1, expect.objectContaining({
      projectId: targetProjectId, serviceAccountId: `vibeestimate-runtime@${targetProjectId}.iam.gserviceaccount.com`,
    }));
    expect(calls.initialize).toHaveBeenNthCalledWith(2, expect.objectContaining({ projectId: sourceProjectId }), "migration-source");
    await expect(runtime.sessionMigration!.exchange("synthetic-source-token")).resolves.toEqual({ uid: "imported-user", customToken: "synthetic-custom-token" });
    expect(calls.sourceVerify).toHaveBeenCalledWith("synthetic-source-token", true);
    expect(calls.verify).not.toHaveBeenCalled();
    expect(collection).toHaveBeenCalledWith("firebaseMigrationUsers");
    expect(doc).toHaveBeenCalledWith("imported-user");
    expect(calls.getUser).toHaveBeenCalledWith("imported-user");
    expect(calls.mint).toHaveBeenCalledWith("imported-user");
    calls.sourceVerify.mockRejectedValueOnce(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    await expect(runtime.sessionMigration!.exchange("revoked-source-token")).rejects.toMatchObject({ status: 401 });
    expect(calls.mint).toHaveBeenCalledTimes(1);
  });
});
