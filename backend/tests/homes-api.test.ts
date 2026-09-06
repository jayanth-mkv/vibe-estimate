import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { FixtureProvider } from "../src/ai.js";
import { FixtureHomeProvider, HomeModelError } from "../src/home-ai.js";
import { HomeService } from "../src/home-service.js";
import { HomeStore, HOME_LIMITS } from "../src/home-store.js";
import type { HomeProject } from "../src/home-types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryHomeDatabase } from "./home-helpers.js";
vi.setConfig({ testTimeout: 30_000 });

describe("owner-scoped home API and persistent request boundary", () => {
  let projects: MemoryProjectStore; let database: MemoryHomeDatabase; let store: HomeStore; let provider: FixtureHomeProvider; let service: HomeService; let app: ReturnType<typeof createApp>;
  const owner = "Bearer owner"; const other = "Bearer other";
  beforeEach(() => {
    projects = new MemoryProjectStore(); database = new MemoryHomeDatabase(projects); store = new HomeStore(database); provider = new FixtureHomeProvider(); service = new HomeService(store, provider, projects);
    app = createApp({ config: readConfig({}), store: projects, provider: new FixtureProvider(), homes: service, verifyToken: async token => ({ uid: token }) });
  });
  const post = (path: string, body: unknown) => request(app).post(path).set("Authorization", owner).send(body);
  const get = (path: string) => request(app).get(path).set("Authorization", owner);
  async function create(templateId = "family-home") {
    const created = await post("/api/homes", { requestId: randomUUID() }).expect(201);
    const selected = await post(`/api/homes/${created.body.home.id}/template`, { requestId: randomUUID(), baseRevisionId: null, templateId }).expect(200);
    return selected.body.home as HomeProject;
  }
  const prompt = (home: HomeProject, requestId = randomUUID()) => ({ requestId, baseRevisionId: home.headRevisionId!, prompt: "Add warm ceiling lights throughout the home.", selection: { kind: "home" as const } });
  const paint = (home: HomeProject, requestId = randomUUID()) => ({ requestId, baseRevisionId: home.headRevisionId!, selection: { kind: "home" }, patch: { schemaVersion: 2, operations: [{ op: "setMaterial", entityId: home.scene!.rooms[0]!.id, surface: "floor", materialId: "wood-dark" }] } });

  it("requires auth, denies cross-user home/job/revision/export/proposal access and does not expose internal ledgers", async () => {
    await request(app).get("/api/homes").expect(401); const home = await create();
    for (const path of [`/api/homes/${home.id}`, `/api/homes/${home.id}/revisions/${home.headRevisionId}`, `/api/homes/${home.id}/jobs/${randomUUID()}`, `/api/homes/${home.id}/export?revisionId=${home.headRevisionId}`]) await request(app).get(path).set("Authorization", other).expect(404);
    await request(app).post(`/api/homes/${home.id}/generate`).set("Authorization", other).send(prompt(home)).expect(404);
    await request(app).post(`/api/homes/${home.id}/proposal`).set("Authorization", other).send({ requestId: randomUUID(), baseRevisionId: home.headRevisionId }).expect(404);
    expect((await request(app).get("/api/homes").set("Authorization", other)).body.homes).toEqual([]);
    const json = (await get(`/api/homes/${home.id}`)).body.home;
    for (const field of ["ownerId", "jobs", "receipts", "callsUsed"]) expect(json[field]).toBeUndefined();
  });
  it("creates idempotently and opens all three admitted templates with real valid stored scenes", async () => {
    const input = { requestId: randomUUID() }; const first = await post("/api/homes", input).expect(201); const second = await post("/api/homes", input).expect(201); expect(second.body.home.id).toBe(first.body.home.id);
    await post("/api/homes", { ...input, ownerId: "other" }).expect(422);
    const templates = (await get("/api/home-templates")).body.templates;
    expect(templates).toHaveLength(3);
    for (const template of templates) { const home = await create(template.id); expect(home.scene!.rooms.length).toBe(template.roomCount); expect(home.revisions).toHaveLength(1); }
    await post(`/api/homes/${first.body.home.id}/template`, { requestId: randomUUID(), templateId: "remote-url", baseRevisionId: null }).expect(422);
  });
  it("generates admitted lights once, replays its receipt after restart, and records model and deterministic changes", async () => {
    const home = await create(); const input = prompt(home); const spy = vi.spyOn(provider, "generate");
    const generated = await post(`/api/homes/${home.id}/generate`, input).expect(200);
    expect(generated.body.job.status).toBe("complete"); expect(generated.body.job.attemptsUsed).toBe(1); expect(generated.body.home.scene.instances.length).toBeGreaterThan(home.scene!.instances.length);
    expect(generated.body.home.revisions.at(-1)).toMatchObject({ model: "local-fixture", source: "fixture" }); expect(generated.body.home.revisions.at(-1).changes.length).toBeGreaterThan(0);
    const reopened = new HomeService(new HomeStore(database), provider, projects);
    const replay = await reopened.generate("owner", home.id, input); expect(replay.job.status).toBe("complete"); expect(replay.home.revisions).toHaveLength(2); expect(spy).toHaveBeenCalledTimes(1);
    await post(`/api/homes/${home.id}/generate`, { ...input, prompt: "A different request" }).expect(409);
    expect(database.owners.get("owner")!.callsUsed).toBe(1);
  });
  it("validates scope before spending and rejects a whole invalid model patch atomically without fallback", async () => {
    const home = await create(); const spy = vi.spyOn(provider, "generate");
    await post(`/api/homes/${home.id}/generate`, { ...prompt(home), selection: { kind: "room", roomId: "foreign-room" } }).expect(422); expect(spy).not.toHaveBeenCalled();
    spy.mockResolvedValue({ title: "Invalid", summary: "Invalid change", operations: [{ op: "setMaterial", entityId: home.scene!.rooms[0]!.id, surface: "floor", materialId: "wood-dark" }, { op: "remove", entityId: "unknown-object" }] });
    const result = await post(`/api/homes/${home.id}/generate`, prompt(home)).expect(200);
    expect(result.body.job).toMatchObject({ status: "failed", error: { code: "DESIGN_INVALID_RESPONSE" } }); expect(result.body.home.scene).toEqual(home.scene); expect(spy).toHaveBeenCalledTimes(1);
  });
  it("preserves both concurrent manual versions and restores by creating another immutable revision", async () => {
    const home = await create(); const first = await post(`/api/homes/${home.id}/revisions`, paint(home)).expect(200);
    await post(`/api/homes/${home.id}/template`, { requestId: randomUUID(), templateId: "garden-home", baseRevisionId: randomUUID() }).expect(404);
    await post(`/api/homes/${home.id}/restore`, { requestId: randomUUID(), baseRevisionId: randomUUID(), revisionId: home.headRevisionId }).expect(404);
    const second = await post(`/api/homes/${home.id}/revisions`, paint(home)).expect(200);
    expect(second.body.home.headRevisionId).toBe(first.body.home.headRevisionId); expect(second.body.home.revisions).toHaveLength(3); expect(second.body.home.revisions.at(-1).conflict).toBe(true);
    const conflict = (await get(`/api/homes/${home.id}/revisions/${second.body.home.revisions.at(-1).id}`)).body.revision; expect(conflict.conflict).toBe(true);
    const restored = await post(`/api/homes/${home.id}/restore`, { requestId: randomUUID(), baseRevisionId: first.body.home.headRevisionId, revisionId: home.headRevisionId }).expect(200);
    expect(restored.body.home.scene).toEqual(home.scene); expect(restored.body.home.revisions).toHaveLength(4); expect(restored.body.home.headRevisionId).not.toBe(home.headRevisionId);
  });
  it("cancels an in-flight model, preserves the prior layout and never publishes its late result", async () => {
    const home = await create(); const input = prompt(home); const original = provider.generate.bind(provider);
    let entered!: () => void; let release!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); const waiting = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(provider, "generate").mockImplementation(async context => { entered(); await waiting; return original(context); });
    const pending = post(`/api/homes/${home.id}/generate`, input).then(value => value); await started;
    await post(`/api/homes/${home.id}/jobs/${input.requestId}/cancel`, { requestId: input.requestId }).expect(200); release();
    const result = await pending; expect(result.body.job.status).toBe("cancelled"); expect(result.body.home.headRevisionId).toBe(home.headRevisionId); expect(result.body.home.revisions).toHaveLength(1);
  });
  it("prevents a second owner-wide job, marks interrupted reservations unknown and never redispatches them", async () => {
    let time = 100; const timed = new HomeStore(database, () => time); const one = await create(); const two = await create(); const requestId = randomUUID();
    await timed.beginJob("owner", one.id, { requestId, baseRevisionId: one.headRevisionId!, kind: "generate", hash: "saved-hash" });
    await expect(timed.beginJob("owner", two.id, { requestId: randomUUID(), baseRevisionId: two.headRevisionId!, kind: "generate", hash: "second" })).rejects.toMatchObject({ code: "HOME_JOB_RUNNING" });
    await timed.reserveAttempt("owner", one.id, requestId, "local-fixture"); time += HOME_LIMITS.leaseMs + 1;
    expect((await timed.job("owner", one.id, requestId)).status).toBe("unknown");
    expect((await timed.beginJob("owner", one.id, { requestId, baseRevisionId: one.headRevisionId!, kind: "generate", hash: "saved-hash" })).dispatch).toBe(false);
    expect(database.owners.get("owner")!.callsUsed).toBe(1);
  });
  it("resumes a durable save without a paid redispatch and lets cancellation stop a pending save", async () => {
    const home = await create(); const input = prompt(home); const spy = vi.spyOn(provider, "generate"); const complete = vi.spyOn(store, "complete").mockRejectedValueOnce(new Error("private saved response"));
    const pending = await post(`/api/homes/${home.id}/generate`, input).expect(200); expect(pending.body.job.status).toBe("save_pending");
    const finished = await post(`/api/homes/${home.id}/jobs/${input.requestId}/resume`, { requestId: input.requestId }).expect(200); expect(finished.body.job.status).toBe("complete"); expect(spy).toHaveBeenCalledTimes(1); complete.mockRestore();
    const next = prompt(finished.body.home); vi.spyOn(store, "complete").mockRejectedValueOnce(new Error("pending"));
    const another = await post(`/api/homes/${home.id}/generate`, next).expect(200); expect(another.body.job.status).toBe("save_pending");
    await store.fail("owner", home.id, next.requestId, "cancelled"); await store.complete("owner", home.id, next.requestId);
    expect((await store.get("owner", home.id)).headRevisionId).toBe(finished.body.home.headRevisionId);
  });
  it("advances only on a definite recoverable rejection and reserves each actual model attempt", async () => {
    const home = await create(); const original = provider.generate.bind(provider);
    Object.defineProperty(provider, "models", { value: ["first", "fallback"] });
    const spy = vi.spyOn(provider, "generate").mockRejectedValueOnce(new HomeModelError("definite", true)).mockImplementationOnce(context => original(context));
    const result = await post(`/api/homes/${home.id}/generate`, prompt(home)).expect(200); expect(result.body.job).toMatchObject({ status: "complete", attemptsUsed: 2, model: "fallback" }); expect(spy).toHaveBeenCalledTimes(2);
    const latest = result.body.home; spy.mockRejectedValueOnce(new HomeModelError("unknown", false));
    const uncertain = await post(`/api/homes/${home.id}/generate`, prompt(latest)).expect(200); expect(uncertain.body.job.status).toBe("unknown"); expect(spy).toHaveBeenCalledTimes(3); expect(uncertain.body.home.headRevisionId).toBe(latest.headRevisionId);
  });
  it("keeps manual edits available after model budget exhaustion and makes no model calls while viewing", async () => {
    const home = await create(); database.homes.get(home.id)!.callsUsed = HOME_LIMITS.homeCalls;
    const spy = vi.spyOn(provider, "generate"); await post(`/api/homes/${home.id}/generate`, prompt(home)).expect(429);
    await get(`/api/homes/${home.id}`).expect(200); await get("/api/home-templates").expect(200); await post(`/api/homes/${home.id}/revisions`, paint(home)).expect(200); expect(spy).not.toHaveBeenCalled();
  });
  it("preserves the last valid layout after failed content storage and does not retry an uncertain result", async () => {
    const home = await create(); const input = prompt(home); const spy = vi.spyOn(provider, "generate"); database.failRevisionWrites = 2;
    const failed = await post(`/api/homes/${home.id}/generate`, input).expect(200);
    expect(failed.body.job.status).toBe("unknown"); expect(failed.body.home.scene).toEqual(home.scene); expect(JSON.stringify(failed.body)).not.toContain("private storage");
    await post(`/api/homes/${home.id}/generate`, input).expect(200); expect(spy).toHaveBeenCalledTimes(1);
    await post(`/api/homes/${home.id}/jobs/${input.requestId}/resume`, { requestId: input.requestId }).expect(409);
  });
  it("reports fallback exhaustion as a bounded visible failure without changing the scene", async () => {
    const home = await create(); Object.defineProperty(provider, "models", { value: ["first", "fallback"] });
    const spy = vi.spyOn(provider, "generate").mockRejectedValue(new HomeModelError("definite", true));
    const result = await post(`/api/homes/${home.id}/generate`, prompt(home)).expect(200);
    expect(result.body.job).toMatchObject({ status: "failed", attemptsUsed: 2, model: "fallback" }); expect(result.body.home.scene).toEqual(home.scene); expect(spy).toHaveBeenCalledTimes(2);
  });
  it("creates a factual saved summary and source-prefilled legacy project without prices or invented approval", async () => {
    const home = await create(); const input = { requestId: randomUUID(), baseRevisionId: home.headRevisionId };
    const spy = vi.spyOn(provider, "summarize");
    const summary = await post(`/api/homes/${home.id}/summary`, input).expect(200); expect(summary.body.job.status).toBe("complete");
    const cached = await post(`/api/homes/${home.id}/summary`, { ...input, requestId: randomUUID() }).expect(200); expect(cached.body.job.attemptsUsed).toBe(0); expect(spy).toHaveBeenCalledTimes(1);
    const exported = await get(`/api/homes/${home.id}/export?revisionId=${home.headRevisionId}`).expect(200); expect(exported.text).toContain(home.headRevisionId); expect(exported.text).toContain("Prices"); expect(exported.text).toContain("not a quotation");
    const proposal = await post(`/api/homes/${home.id}/proposal`, { ...input, requestId: randomUUID() }).expect(200); expect(proposal.body.project.proposals).toEqual([]); expect(proposal.body.project.scope).toContain("No construction scope"); expect(proposal.body.project.messages).toContain("not client messages or approval");
  });
});
