import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { VerifiedFirebaseIdentity } from "../src/firebase-auth-policy.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { MemoryProjectStore } from "./helpers.js";

const web = { projectId: "target-project", authMode: "google" };
const production = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: web.projectId, FRONTEND_ORIGIN: "https://example.test",
  GEMINI_MODEL: "synthetic-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: web.projectId, VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/target-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@target-project.iam.gserviceaccount.com",
  FIREBASE_WEB_CONFIG: JSON.stringify(web),
};
const input = { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES };
const googleIdentity = (uid = "saved-owner") => ({ uid, firebase: { identities: { "google.com": [`synthetic-google-${uid}`] }, sign_in_provider: "google.com" } });

function api(identity: VerifiedFirebaseIdentity = googleIdentity(), settings: NodeJS.ProcessEnv = {}) {
  const store = new MemoryProjectStore();
  const provider = { kind: "gemini" as const, analyze: vi.fn() };
  const verifyToken = vi.fn(async (token: string) => {
    if (token !== "verified-target-token") throw new Error("synthetic-private-verification-details");
    return identity;
  });
  const app = createApp({ config: readConfig({ ...production, ...settings }), store, provider, verifyToken });
  return { app, store, provider, verifyToken };
}

describe("explicit Google-only Firebase policy", () => {
  it("pins policy to the same target as token verification while keeping unconfigured fixtures unchanged", () => {
    expect(readConfig(production).authMode).toBe("google");
    expect(readConfig({}).authMode).toBeUndefined();
    expect(readConfig({ ...production, FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: web.projectId }) }).authMode).toBeUndefined();
    for (const authMode of ["anonymous", "Google", "false", false, null, {}]) {
      expect(() => readConfig({ ...production, FIREBASE_WEB_CONFIG: JSON.stringify({ ...web, authMode }) })).toThrow(/authMode/);
    }
    expect(() => readConfig({ ...production, FIREBASE_WEB_CONFIG: JSON.stringify({ ...web, projectId: "other-project" }) })).toThrow(/authMode/);
  });

  it.each([
    { uid: "saved-owner" },
    { uid: "saved-owner", firebase: { sign_in_provider: "anonymous", identities: {} } },
    { uid: "saved-owner", firebase: { sign_in_provider: "custom", identities: {} } },
    { uid: "saved-owner", email: "synthetic@example.test", email_verified: true, firebase: { sign_in_provider: "password", identities: { email: ["synthetic@example.test"] } } },
    { uid: "saved-owner", firebase: { sign_in_provider: "google.com", identities: {} } },
    { uid: "saved-owner", firebase: { identities: { "google.com": [] } } },
    { uid: "saved-owner", firebase: { identities: { "google.com": "untrusted-shape" } } },
  ])("requires a verified Google identity before any saved-data access or new work", async identity => {
    const { app, store, provider } = api(identity);
    const saved = await store.create("saved-owner", input);
    for (const action of [
      request(app).get("/api/projects"), request(app).get(`/api/projects/${saved.id}`),
      request(app).post("/api/projects").send(input), request(app).post(`/api/projects/${saved.id}/analyze`).send({}),
    ]) {
      const result = await action.set("Authorization", "Bearer verified-target-token").expect(403);
      expect(result.body.error.code).toBe("GOOGLE_AUTH_REQUIRED");
      expect(result.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(result.body)).not.toContain(input.scope);
    }
    expect(await store.get("saved-owner", saved.id)).toEqual(saved);
    expect(store.projects.size).toBe(1);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it.each(["google.com", "custom"])("accepts Google-linked %s sessions and keeps ownership checks", async signInProvider => {
    const identity = { ...googleIdentity(), firebase: { ...googleIdentity().firebase, sign_in_provider: signInProvider } };
    const { app, store } = api(identity);
    const own = await store.create(identity.uid, input);
    const other = await store.create("another-owner", input);
    const result = await request(app).get("/api/projects").set("Authorization", "Bearer verified-target-token").expect(200);
    expect(result.body.projects.map((project: { id: string }) => project.id)).toEqual([own.id]);
    for (const action of [request(app).get(`/api/projects/${other.id}`), request(app).get(`/api/projects/${other.id}/export`), request(app).post(`/api/projects/${other.id}/analyze`).send({})]) {
      await action.set("Authorization", "Bearer verified-target-token").expect(404);
    }
  });

  it("rejects missing, forged and tenant tokens without trusting caller-supplied Google hints", async () => {
    const { app, verifyToken } = api();
    await request(app).get("/api/projects").expect(401);
    expect(verifyToken).not.toHaveBeenCalled();
    const forged = await request(app).get("/api/projects").set("Authorization", "Bearer forged-id-token").set("X-Auth-Provider", "google.com").expect(401);
    expect(JSON.stringify(forged.body)).not.toContain("synthetic-private");
    for (const tenant of [{ firebase: { ...googleIdentity().firebase, tenant: "another-tenant" } }, { tenant_id: "another-tenant" }]) {
      const tenantApp = api({ ...googleIdentity(), ...tenant }).app;
      await request(tenantApp).get("/api/projects").set("Authorization", "Bearer verified-target-token").expect(401);
    }
  });

});
