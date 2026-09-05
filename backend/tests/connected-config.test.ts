import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { localVertexTarget } from "../src/vertex-client.js";
import { MemoryProjectStore } from "./helpers.js";

export const connectedEnv = () => ({
  APP_ENV: "connected", NODE_ENV: "development", AI_PROVIDER: "gemini", FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  FIREBASE_PROJECT_ID: "synthetic-firebase-project", FIRESTORE_DATABASE_ID: "(default)",
  CONNECTED_AUTH_PROJECT_ID: "synthetic-backend-project", CONNECTED_AUTH_GCLOUD_CONFIGURATION: "synthetic-owner",
  CONNECTED_AUTH_GCLOUD_ACCOUNT: "owner@example.test", CONNECTED_AUTH_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud"),
  GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: "gemini-3.7-flash", VERTEX_PROJECT_ID: "synthetic-backend-project", VERTEX_LOCATION: "global",
  VERTEX_GCLOUD_CONFIGURATION: "synthetic-owner", VERTEX_GCLOUD_ACCOUNT: "owner@example.test", VERTEX_GCLOUD_CONFIG_DIR: path.join(os.tmpdir(), "synthetic-gcloud")
});

describe("connected local runtime configuration boundaries", () => {
  it("separates explicit Firebase resources from the named-profile backend and Vertex project", () => {
    const config = readConfig(connectedEnv());
    expect(config).toMatchObject({ appEnv: "connected", aiProvider: "gemini", projectId: "synthetic-firebase-project", firestoreDatabaseId: "(default)", connectedAuthProjectId: "synthetic-backend-project", vertexProjectId: "synthetic-backend-project" });
    expect(config.authEmulatorHost).toBeUndefined();
    expect(config.firestoreEmulatorHost).toBeUndefined();
    expect(localVertexTarget(config).projectId).toBe("synthetic-backend-project");
    expect(readConfig({ ...connectedEnv(), FRONTEND_ORIGIN: "http://localhost:3100" }).appEnv).toBe("connected");
  });
  it.each(["FIREBASE_PROJECT_ID", "FIRESTORE_DATABASE_ID", "FRONTEND_ORIGIN", "CONNECTED_AUTH_PROJECT_ID", "CONNECTED_AUTH_GCLOUD_CONFIGURATION", "CONNECTED_AUTH_GCLOUD_ACCOUNT", "CONNECTED_AUTH_GCLOUD_CONFIG_DIR"])("requires explicit %s and does not infer it from other project defaults", key => {
    expect(() => readConfig({ ...connectedEnv(), [key]: undefined, GCLOUD_PROJECT: "unrelated-default-project" })).toThrow();
  });
  it.each([
    { FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" },
    { FIREBASE_AUTH_EMULATOR_HOST: "" }, { firestore_emulator_host: "" },
    { FIREBASE_PROJECT_ID: "demo-vibeestimate" }, { FIREBASE_PROJECT_ID: "bad/project" },
    { FIRESTORE_DATABASE_ID: "../unrelated" }, { AI_PROVIDER: "fixture" },
    { NODE_ENV: "production" }, { K_SERVICE: "cloud-run" }, { K_SERVICE: "" },
    { FRONTEND_ORIGIN: "http://remote.example.test" }, { FRONTEND_ORIGIN: "https://127.0.0.1:3000" },
    { FRONTEND_ORIGIN: "http://127.0.0.1:3000/path" }, { FRONTEND_ORIGIN: "http://127.0.0.1.example.test" },
    { GOOGLE_APPLICATION_CREDENTIALS: "/synthetic/adc.json" }, { google_oauth_access_token: "synthetic-token" },
    { CLOUDSDK_AUTH_ACCESS_TOKEN: "synthetic-token" }, { GOOGLE_API_KEY: "synthetic-key" },
    { CONNECTED_AUTH_GCLOUD_ACCOUNT: "service@project.iam.gserviceaccount.com" },
    { CONNECTED_AUTH_GCLOUD_CONFIG_DIR: "relative-path" }
  ])("rejects mixed, production, remote and credential-override configurations", input => {
    expect(() => readConfig({ ...connectedEnv(), ...input })).toThrow();
  });
  it("keeps the default fixture/emulator mode and production Vertex prohibition intact", () => {
    expect(readConfig({})).toMatchObject({ appEnv: "local", aiProvider: "fixture", projectId: "demo-vibeestimate", authEmulatorHost: "127.0.0.1:9099", firestoreEmulatorHost: "127.0.0.1:8085" });
    expect(() => readConfig({ ...connectedEnv(), APP_ENV: "local" })).toThrow();
    expect(() => readConfig({ ...connectedEnv(), APP_ENV: "production", NODE_ENV: "production", FRONTEND_ORIGIN: "https://example.test" })).toThrow();
  });
  it("reports configured cloud versus emulator storage without leaking private target configuration", async () => {
    const config = readConfig(connectedEnv());
    const app = createApp({ config, store: new MemoryProjectStore(), provider: { kind: "gemini", analyze: async () => { throw new Error("Not called by health."); } }, verifyToken: async () => ({ uid: "synthetic-user" }) });
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toMatchObject({ status: "ok", auth: "firebase", storage: "firestore", storageConnection: "cloud", runtime: "connected", aiProvider: "gemini", geminiTransport: "vertex" });
    expect(JSON.stringify(response.body)).not.toContain("synthetic-firebase-project");
    expect(JSON.stringify(response.body)).not.toContain("owner@example.test");
  });
  it("keeps a guest identity on verifier-service failure while rejecting revoked or disabled tokens", async () => {
    const config = readConfig(connectedEnv());
    let errorCode = "CONNECTED_AUTH_UNAVAILABLE";
    const app = createApp({ config, store: new MemoryProjectStore(), provider: { kind: "gemini", analyze: async () => { throw new Error("Not called."); } }, verifyToken: async () => { throw Object.assign(new Error("Private provider credential details"), { code: errorCode }); } });
    for (const code of ["CONNECTED_AUTH_UNAVAILABLE", "auth/internal-error", "app/invalid-credential"]) {
      errorCode = code;
      const response = await request(app).get("/api/projects").set("Authorization", "Bearer synthetic-token").expect(503);
      expect(response.body.error.code).toBe("AUTH_UNAVAILABLE");
      expect(JSON.stringify(response.body)).not.toContain("Private provider");
    }
    for (const code of ["auth/id-token-revoked", "auth/user-disabled", "auth/id-token-expired"]) {
      errorCode = code;
      await request(app).get("/api/projects").set("Authorization", "Bearer synthetic-token").expect(401);
    }
  });
});
