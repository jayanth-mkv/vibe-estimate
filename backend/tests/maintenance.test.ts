import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { MemoryProjectStore } from "./helpers.js";

const settings = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "test-project", FRONTEND_ORIGIN: "https://example.test",
  GEMINI_MODEL: "synthetic-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "test-project", VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/test-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@test-project.iam.gserviceaccount.com",
  FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: "test-project", authMode: "google" }),
};
function api(maintenance: "true" | "false") {
  const store = new MemoryProjectStore();
  const verifyToken = vi.fn(async () => ({ uid: "saved-owner", firebase: { identities: { "google.com": ["synthetic-google-id"] } } }));
  const provider = { kind: "gemini" as const, analyze: vi.fn() };
  const app = createApp({ config: readConfig({ ...settings, APP_MAINTENANCE: maintenance }), store, provider, verifyToken });
  return { app, store, verifyToken, provider };
}

describe("production maintenance mode", () => {
  it("pauses business and worker access before authentication or work while preserving health and saved records", async () => {
    const value = api("true");
    const saved = await value.store.create("saved-owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
    for (const route of ["/api/projects", `/api/projects/${saved.id}/analyze`, "/internal/observer", "/internal/reconcile", "/internal/firestore"]) {
      const response = await request(value.app).post(route).set("Authorization", "Bearer synthetic-token").send({}).expect(503);
      expect(response.body.error.code).toBe("SERVER_MAINTENANCE");
      expect(response.body.error.message).toContain("maintenance");
      expect(response.headers["retry-after"]).toBe("60");
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    await request(value.app).get("/api/projects").expect(503);
    const health = await request(value.app).get("/health").expect(200);
    expect(health.body.maintenance).toBe(true);
    expect(value.verifyToken).not.toHaveBeenCalled();
    expect(value.provider.analyze).not.toHaveBeenCalled();
    expect(await value.store.get("saved-owner", saved.id)).toEqual(saved);
    expect(value.store.projects.size).toBe(1);
  });

  it("keeps ordinary authenticated access available when disabled", async () => {
    const value = api("false");
    await request(value.app).get("/api/projects").expect(401);
    await request(value.app).get("/api/projects").set("Authorization", "Bearer synthetic-token").expect(200);
    expect(value.verifyToken).toHaveBeenCalledTimes(1);
    expect((await request(value.app).get("/health").expect(200)).body.maintenance).toBeUndefined();
  });

  it("requires an explicit boolean and production configuration", () => {
    expect(readConfig(settings).maintenance).toBe(false);
    for (const input of ["yes", "1", "TRUE", ""]) expect(() => readConfig({ ...settings, APP_MAINTENANCE: input })).toThrow(/explicit boolean/);
    expect(() => readConfig({ APP_MAINTENANCE: "true" })).toThrow(/Maintenance mode requires production/);
  });
});
