import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { createSessionMigration, readFirebaseMigration } from "../src/firebase-migration.js";
import { MemoryProjectStore } from "./helpers.js";

const migration = { sourceProjectId: "source-project", snapshotSha256: "a".repeat(64) };
const mapping = { ...migration, sourceUid: "saved-owner", targetUid: "saved-owner" };
const web = { projectId: "target-project", appNamespace: "migrated", legacy: { projectId: "source-project" }, migrationSnapshotSha256: migration.snapshotSha256 };
const settings = {
  APP_ENV: "production", NODE_ENV: "production", FIREBASE_PROJECT_ID: "target-project", FRONTEND_ORIGIN: "https://example.test",
  GEMINI_MODEL: "synthetic-model", GEMINI_TRANSPORT: "vertex", VERTEX_AUTH_MODE: "runtime", VERTEX_PROJECT_ID: "target-project", VERTEX_LOCATION: "global",
  ROOM_TASK_QUEUE: "projects/target-project/locations/asia-southeast1/queues/reviews", ROOM_TASK_SERVICE_ACCOUNT: "delivery@target-project.iam.gserviceaccount.com",
  FIREBASE_WEB_CONFIG: JSON.stringify(web),
};
function setup() {
  const dependencies = {
    verifySource: vi.fn(async (_token: string) => ({ uid: "saved-owner" })),
    mapping: vi.fn(async (_uid: string): Promise<unknown> => mapping),
    targetUser: vi.fn(async (_uid: string) => ({ uid: "saved-owner", disabled: false })),
    createToken: vi.fn(async (_uid: string) => "synthetic-target-custom-token"),
  };
  return { dependencies, bridge: createSessionMigration(migration, dependencies) };
}

describe("Firebase migration trust boundary", () => {
  it("binds production migration to distinct projects, a stable app namespace and an exact snapshot", () => {
    expect(readFirebaseMigration(undefined, "target-project", "production")).toBeUndefined();
    expect(readFirebaseMigration(JSON.stringify({ projectId: "target-project", appNamespace: "migrated" }), "target-project", "production")).toBeUndefined();
    expect(readFirebaseMigration(JSON.stringify(web), "target-project", "production")).toEqual(migration);
    for (const value of [{ ...web, projectId: "other-project" }, { ...web, appNamespace: undefined }, { ...web, legacy: { projectId: "target-project" } },
      { ...web, legacy: { projectId: "demo-source" } }, { ...web, migrationSnapshotSha256: "unknown" }, { ...web, legacy: undefined }]) {
      expect(() => readFirebaseMigration(JSON.stringify(value), "target-project", "production")).toThrow();
    }
    for (const environment of ["local", "connected"]) expect(() => readFirebaseMigration(JSON.stringify(web), "target-project", environment)).toThrow();
    expect(() => readFirebaseMigration("not-json", "target-project", "production")).toThrow();
  });

  it("transfers only the verified source UID into its imported destination account", async () => {
    const { bridge, dependencies } = setup();
    await expect(bridge.exchange("synthetic-source-token")).resolves.toEqual({ uid: "saved-owner", customToken: "synthetic-target-custom-token" });
    expect(dependencies.verifySource).toHaveBeenCalledWith("synthetic-source-token");
    expect(dependencies.mapping).toHaveBeenCalledWith("saved-owner");
    expect(dependencies.targetUser).toHaveBeenCalledWith("saved-owner");
    expect(dependencies.createToken).toHaveBeenCalledWith("saved-owner");
  });

  it.each([undefined, { ...mapping, sourceProjectId: "other-project" }, { ...mapping, sourceUid: "another-user" },
    { ...mapping, targetUid: "another-user" }, { ...mapping, snapshotSha256: "b".repeat(64) }, { ...mapping, untrusted: true }])(
    "refuses an absent, foreign, modified or unreviewed imported mapping", async value => {
      const { bridge, dependencies } = setup(); dependencies.mapping.mockResolvedValue(value);
      await expect(bridge.exchange("synthetic-source-token")).rejects.toMatchObject({ status: 403, code: "MIGRATION_NOT_READY" });
      expect(dependencies.targetUser).not.toHaveBeenCalled(); expect(dependencies.createToken).not.toHaveBeenCalled();
    });

  it.each(["auth/id-token-revoked", "auth/id-token-expired", "auth/user-disabled", "auth/invalid-id-token"])("denies %s before reading destination records", async code => {
    const { bridge, dependencies } = setup();
    dependencies.verifySource.mockRejectedValue(Object.assign(new Error("synthetic-private-provider-details"), { code }));
    await expect(bridge.exchange("synthetic-source-token")).rejects.toMatchObject({ status: 401, code: "MIGRATION_AUTH_REQUIRED" });
    expect(dependencies.mapping).not.toHaveBeenCalled(); expect(dependencies.createToken).not.toHaveBeenCalled();
  });

  it("surfaces source outage as retryable without creating a destination credential", async () => {
    const { bridge, dependencies } = setup(); dependencies.verifySource.mockRejectedValue(new Error("synthetic-private-provider-details"));
    await expect(bridge.exchange("synthetic-source-token")).rejects.toMatchObject({ status: 503, code: "MIGRATION_UNAVAILABLE" });
    expect(dependencies.createToken).not.toHaveBeenCalled();
  });

  it.each([{ uid: "saved-owner", disabled: true }, { uid: "another-user", disabled: false }])("denies disabled or mismatched target identities", async target => {
    const { bridge, dependencies } = setup(); dependencies.targetUser.mockResolvedValue(target);
    await expect(bridge.exchange("synthetic-source-token")).rejects.toMatchObject({ status: 403 });
    expect(dependencies.createToken).not.toHaveBeenCalled();
  });

  it("rejects invalid source UIDs before using them as document paths", async () => {
    const { bridge, dependencies } = setup(); dependencies.verifySource.mockResolvedValue({ uid: "users/another-user" });
    await expect(bridge.exchange("synthetic-source-token")).rejects.toMatchObject({ status: 401 });
    expect(dependencies.mapping).not.toHaveBeenCalled();
  });
  it("denies same-UID tenant tokens before looking up root-project access", async () => {
    const { dependencies } = setup();
    for (const tenant of [{ firebase: { tenant: "another-tenant" } }, { tenant_id: "another-tenant" }]) {
      const bridge = createSessionMigration(migration, { ...dependencies, verifySource: async () => ({ uid: "saved-owner", ...tenant }) });
      await expect(bridge.exchange("synthetic-tenant-token")).rejects.toMatchObject({ status: 401 });
    }
    expect(dependencies.mapping).not.toHaveBeenCalled(); expect(dependencies.createToken).not.toHaveBeenCalled();
  });
  it("limits by verified UID while invalid tokens and another UID do not consume that allowance", async () => {
    const { dependencies } = setup();
    let now = 1000;
    const bridge = createSessionMigration(migration, { ...dependencies, now: () => now,
      verifySource: async token => {
        if (token === "invalid") throw Object.assign(new Error("invalid"), { code: "auth/invalid-id-token" });
        return { uid: token };
      },
      mapping: async uid => ({ ...mapping, sourceUid: uid, targetUid: uid }),
      targetUser: async uid => ({ uid, disabled: false }),
    });
    for (let index = 0; index < 30; index++) {
      await expect(bridge.exchange("invalid")).rejects.toMatchObject({ status: 401 });
      await bridge.exchange("first-user");
    }
    await expect(bridge.exchange("first-user")).rejects.toMatchObject({ status: 429 });
    await expect(bridge.exchange("second-user")).resolves.toMatchObject({ uid: "second-user" });
    now += 60000;
    await expect(bridge.exchange("first-user")).resolves.toMatchObject({ uid: "first-user" });
    expect(dependencies.createToken).toHaveBeenCalledTimes(32);
  });
  it("does not let valid but unimported source accounts exhaust the imported-user limit map", async () => {
    const { dependencies } = setup();
    const bridge = createSessionMigration(migration, { ...dependencies,
      verifySource: async uid => ({ uid }),
      mapping: async uid => uid === "saved-owner" ? mapping : undefined,
    });
    for (let index = 0; index < 1001; index++) {
      await expect(bridge.exchange(`unimported-${index}`)).rejects.toMatchObject({ status: 403 });
    }
    await expect(bridge.exchange("saved-owner")).resolves.toMatchObject({ uid: "saved-owner" });
    expect(dependencies.createToken).toHaveBeenCalledTimes(1);
  });
});

function api(overrides: NodeJS.ProcessEnv = {}) {
  const sessionMigration = { exchange: vi.fn(async (_token: string) => ({ uid: "saved-owner", customToken: "synthetic-target-custom-token" })) };
  const verifyToken = vi.fn(async (token: string) => { if (token !== "synthetic-target-token") throw new Error("untrusted source token"); return { uid: "saved-owner" }; });
  const provider = { kind: "gemini" as const, analyze: vi.fn() };
  const app = createApp({ config: readConfig({ ...settings, ...overrides }), store: new MemoryProjectStore(), provider, verifyToken, sessionMigration });
  return { app, sessionMigration, verifyToken, provider };
}

describe("migration endpoint and controlled write pause", () => {
  it("accepts the source token only on the exchange endpoint with a private uncached response", async () => {
    const value = api();
    const result = await request(value.app).post("/api/auth/migrate").set("Authorization", "Bearer synthetic-source-token").send({}).expect(200);
    expect(result.body).toEqual({ uid: "saved-owner", customToken: "synthetic-target-custom-token" });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(value.verifyToken).not.toHaveBeenCalled();
    await request(value.app).get("/api/projects").set("Authorization", "Bearer synthetic-source-token").expect(401);
    expect(value.sessionMigration.exchange).toHaveBeenCalledTimes(1);
  });

  it("denies cookie-only requests and arbitrary requested UIDs", async () => {
    const value = api();
    await request(value.app).post("/api/auth/migrate").set("Cookie", "token=synthetic-source-token").send({}).expect(401);
    await request(value.app).post("/api/auth/migrate").set("Authorization", "Bearer synthetic-source-token").send({ uid: "another-user" }).expect(422);
    expect(value.sessionMigration.exchange).not.toHaveBeenCalled();
  });

  it("removes exchange access when the temporary configuration is absent", async () => {
    const value = api({ FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: "target-project", appNamespace: "migrated" }) });
    await request(value.app).post("/api/auth/migrate").set("Authorization", "Bearer synthetic-target-token").send({}).expect(404);
    expect(value.sessionMigration.exchange).not.toHaveBeenCalled();
  });

  it("does not let unauthenticated calls exhaust a shared gateway-IP allowance", async () => {
    const value = api();
    for (let index = 0; index < 31; index++) await request(value.app).post("/api/auth/migrate").send({}).expect(401);
    await request(value.app).post("/api/auth/migrate").set("Authorization", "Bearer synthetic-source-token").send({}).expect(200);
    expect(value.sessionMigration.exchange).toHaveBeenCalledTimes(1);
  });

  it("pauses API reads/writes, token exchanges and internal workers while retaining process health", async () => {
    const value = api({ APP_MAINTENANCE: "true" });
    for (const path of ["/api/projects", "/api/auth/migrate", "/internal/observer", "/internal/reconcile", "/internal/firestore"]) {
      const result = await request(value.app).post(path).set("Authorization", "Bearer synthetic-target-token").send({}).expect(503);
      expect(result.body.error.code).toBe("MIGRATION_MAINTENANCE"); expect(result.headers["retry-after"]).toBe("60");
    }
    await request(value.app).get("/api/projects").expect(503);
    const health = await request(value.app).get("/health").expect(200); expect(health.body.maintenance).toBe(true);
    expect(value.verifyToken).not.toHaveBeenCalled(); expect(value.sessionMigration.exchange).not.toHaveBeenCalled(); expect(value.provider.analyze).not.toHaveBeenCalled();
  });

  it("rejects ambiguous maintenance settings and keeps ordinary mode active", () => {
    expect(readConfig(settings).maintenance).toBe(false);
    expect(() => readConfig({ ...settings, APP_MAINTENANCE: "yes" })).toThrow();
    expect(() => readConfig({ APP_MAINTENANCE: "true" })).toThrow();
  });
});
