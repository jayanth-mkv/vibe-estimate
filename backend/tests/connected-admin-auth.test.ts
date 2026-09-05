import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, getApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readConfig } from "../src/config.js";
import { createFirebaseRuntime } from "../src/firebase-runtime.js";

const require = createRequire(import.meta.url);
// Intercept only the installed SDK's network boundary. Its credential handling,
// quota-header assembly, user parsing, and revocation checks remain unchanged.
const { HttpClient } = require(path.join(path.dirname(require.resolve("firebase-admin/app")), "../utils/api-request.js"));
const config = () => readConfig({
  APP_ENV: "connected", AI_PROVIDER: "gemini", FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  FIREBASE_PROJECT_ID: "synthetic-firebase-project", FIRESTORE_DATABASE_ID: "(default)",
  CONNECTED_AUTH_PROJECT_ID: "synthetic-backend-project", CONNECTED_AUTH_GCLOUD_CONFIGURATION: "synthetic-owner",
  CONNECTED_AUTH_GCLOUD_ACCOUNT: "owner@example.test", CONNECTED_AUTH_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud"),
  GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-3.7-flash", VERTEX_PROJECT_ID: "synthetic-backend-project", VERTEX_LOCATION: "global",
  VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner", VERTEX_GCLOUD_ACCOUNT: "owner@example.test", VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud")
});
let runtime: ReturnType<typeof createFirebaseRuntime> | undefined;
beforeEach(() => {
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", undefined);
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", undefined);
  vi.stubEnv("GOOGLE_CLOUD_QUOTA_PROJECT", "unrelated-inherited-project");
});
afterEach(async () => {
  await runtime?.firestore.terminate();
  await Promise.all(getApps().map(app => deleteApp(app)));
  runtime = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("installed Admin SDK connected quota routing", () => {
  it("attaches the explicit Firebase quota project to real SDK account lookups using the shared short-lived credential", async () => {
    const obtain = vi.fn(async () => "synthetic-short-lived-token");
    const inspect = vi.fn(async () => ({ expiry_date: Date.now() + 3600000, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }));
    const send = vi.spyOn(HttpClient.prototype, "send").mockResolvedValue({
      status: 200, data: { users: [{ localId: "synthetic-user", validSince: "1000", disabled: false }] }
    });
    runtime = createFirebaseRuntime(config(), { obtain, inspect, env: {} });
    const user = await getAuth(getApp()).getUser("synthetic-user");
    expect(user.uid).toBe("synthetic-user");
    expect(user.disabled).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      method: "POST",
      url: "https://identitytoolkit.googleapis.com/v1/projects/synthetic-firebase-project/accounts:lookup",
      headers: { Authorization: "Bearer synthetic-short-lived-token", "x-goog-user-project": "synthetic-firebase-project" },
      data: { localId: ["synthetic-user"] }
    });
    expect(obtain).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it("fails before the account request when the explicit credential is unavailable", async () => {
    const send = vi.spyOn(HttpClient.prototype, "send").mockRejectedValue(new Error("Unexpected network request"));
    runtime = createFirebaseRuntime(config(), {
      obtain: async () => { throw new Error("synthetic private provider error"); }, env: {}
    });
    const error = await getAuth(getApp()).getUser("synthetic-user").catch(error => error);
    expect(error.code).toBe("app/invalid-credential");
    expect(error.message).not.toContain("synthetic private provider error");
    expect(send).not.toHaveBeenCalled();
  });
});
