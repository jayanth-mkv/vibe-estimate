import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { FixtureProvider } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { MemoryProjectStore } from "./helpers.js";

describe("durable direct-review requests (no network/model services)", () => {
  let store: MemoryProjectStore;
  let provider: FixtureProvider;
  let app: ReturnType<typeof createApp>;
  const input = { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES };
  const makeApp = () => createApp({ config: readConfig({}), store, provider, verifyToken: async token => ({ uid: token === "owner-token" ? "owner" : "other" }) });
  beforeEach(() => { store = new MemoryProjectStore(); provider = new FixtureProvider(); app = makeApp(); });
  afterEach(() => vi.restoreAllMocks());
  const create = async () => (await store.create("owner", input)).id;
  const analyze = (id: string, body: object = {}) => request(app).post(`/api/projects/${id}/analyze`).set("Authorization", "Bearer owner-token").send(body);
  const get = (id: string) => request(app).get(`/api/projects/${id}`).set("Authorization", "Bearer owner-token");
  const draft = (id: string, quantity = 6) => request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send({ quantity, unitPricePaise: 200000, requestId: randomUUID() });
  function holdProvider() {
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const original = provider.analyze.bind(provider);
    const spy = vi.spyOn(provider, "analyze").mockImplementation(async (project, clarification) => {
      entered(); await waiting; return original(project, clarification);
    });
    return { release, started, spy };
  }

  it.each([
    { label: "legacy first review", clarification: undefined, idempotency: false },
    { label: "identified first review", clarification: undefined, idempotency: true },
    { label: "legacy clarification", clarification: "Quote 6 lights", idempotency: false },
    { label: "identified clarification", clarification: "Quote 6 lights", idempotency: true }
  ])("claims $label once and preserves a draft on replay", async ({ clarification, idempotency }) => {
    const id = await create();
    if (clarification) await analyze(id).expect(200);
    const body = { ...(clarification ? { clarification } : {}), ...(idempotency ? { requestId: randomUUID() } : {}) };
    const gate = holdProvider();
    const pending = analyze(id, body).then(response => response);
    await gate.started;
    try {
      const duplicate = await analyze(id, body).expect(409);
      expect(duplicate.body.error).toMatchObject({ code: "REVIEW_IN_PROGRESS", reviewRequest: { status: "running", retryAllowed: false } });
      expect(gate.spy).toHaveBeenCalledTimes(1);
    } finally { gate.release(); }
    expect((await pending).status).toBe(200);
    await draft(id).expect(200);
    const beforeReplay = await store.get("owner", id);
    const replay = await analyze(id, body).expect(200);
    expect(gate.spy).toHaveBeenCalledTimes(1);
    expect(await store.get("owner", id)).toEqual(beforeReplay);
    expect(replay.body.project.proposals[0].status).toBe("draft");
    expect(replay.body.project.reviewRequest).toBeUndefined();
    expect(beforeReplay.conversation).toHaveLength(clarification ? 4 : 2);
  });

  it("rejects different concurrent clarification before dispatch, then accepts it against the new conversation", async () => {
    const id = await create(); await analyze(id).expect(200);
    const gate = holdProvider();
    const first = analyze(id, { requestId: randomUUID(), clarification: "Quote 6 lights" }).then(response => response);
    const second = { requestId: randomUUID(), clarification: "Quote 4 lights" };
    await gate.started;
    try {
      expect((await analyze(id, second).expect(409)).body.error.code).toBe("REVIEW_IN_PROGRESS");
      expect(gate.spy).toHaveBeenCalledTimes(1);
    } finally { gate.release(); }
    expect((await first).status).toBe(200);
    await analyze(id, second).expect(200);
    expect(gate.spy).toHaveBeenCalledTimes(2);
    expect(gate.spy.mock.calls[1]?.[0].conversation).toHaveLength(4);
    expect((await store.get("owner", id)).conversation).toHaveLength(6);
  });

  it("retains outstanding clarification metadata when a legacy caller requests its cached first review", async () => {
    const id = await create(); await analyze(id).expect(200);
    const requestId = randomUUID();
    const gate = holdProvider();
    const pending = analyze(id, { requestId, clarification: "Quote 6 lights" }).then(response => response);
    await gate.started;
    try {
      const cached = await analyze(id).expect(200);
      expect(cached.body.project.reviewRequest).toMatchObject({ requestId, status: "running", retryAllowed: false });
      expect(cached.body.project.analysis).toBeDefined();
      await analyze(id, { requestId: randomUUID(), clarification: "Quote 4 lights" }).expect(409);
      expect(gate.spy).toHaveBeenCalledTimes(1);
      expect((await store.get("owner", id)).conversation).toHaveLength(2);
    } finally { gate.release(); }
    expect((await pending).status).toBe(200);
  });

  it("replays an older completed ID after intervening reviews without changing the newest draft", async () => {
    const id = await create();
    const spy = vi.spyOn(provider, "analyze");
    await analyze(id, { requestId: randomUUID() }).expect(200);
    const original = { requestId: randomUUID(), clarification: "Quote 6 lights" };
    await analyze(id, original).expect(200);
    await analyze(id, { requestId: randomUUID(), clarification: "Quote 4 lights" }).expect(200);
    await draft(id, 4).expect(200);
    const saved = (await get(id).expect(200)).body.project;
    expect((await analyze(id, original).expect(200)).body.project).toEqual(saved);
    expect((await analyze(id, { requestId: original.requestId, resumeOnly: true }).expect(200)).body.project).toEqual(saved);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("recognizes a trimmed immediate clarification replay on a pre-ledger project", async () => {
    const id = await create(); await analyze(id).expect(200);
    await analyze(id, { clarification: "Quote 6 lights" }).expect(200);
    await draft(id).expect(200);
    const { analysisRequests: _requests, lastAnalysisKey: _key, ...legacy } = await store.get("owner", id);
    store.projects.set(id, legacy);
    const spy = vi.spyOn(provider, "analyze");
    await analyze(id, { clarification: "  Quote 6 lights  " }).expect(200);
    expect(spy).not.toHaveBeenCalled();
    expect(await store.get("owner", id)).toEqual(legacy);
  });

  it("checks unknown IDs without dispatch and distinguishes omitted fields from an empty or changed clarification", async () => {
    const id = await create(); const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze");
    expect((await analyze(id, { requestId, resumeOnly: true }).expect(404)).body.error.code).toBe("REVIEW_REQUEST_NOT_FOUND");
    expect(spy).not.toHaveBeenCalled();
    await analyze(id, { requestId, clarification: "Quote 6 lights" }).expect(200);
    await analyze(id, { requestId }).expect(200);
    expect((await analyze(id, { requestId, clarification: "Quote 4 lights" }).expect(409)).body.error.code).toBe("REQUEST_REUSED");
    await analyze(id, { requestId, clarification: "" }).expect(422);
    await analyze(id, { requestId, resumeOnly: true, clarification: "Quote 6 lights" }).expect(422);
    await analyze(id, { resumeOnly: true }).expect(422);
    expect((await analyze(id, { requestId: randomUUID(), resumeOnly: true }).expect(404)).body.error.code).toBe("REVIEW_REQUEST_NOT_FOUND");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("keeps a generated result through a final-save failure and resumes on another app instance without a model call", async () => {
    const id = await create(); const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze");
    vi.spyOn(store, "completeAnalysis").mockRejectedValueOnce(new Error("private database credential"));
    const response = await analyze(id, { requestId }).expect(503);
    expect(response.body.error).toMatchObject({ code: "REVIEW_SAVE_PENDING", reviewRequest: { requestId, status: "save_pending", retryAllowed: false } });
    const pending = await store.get("owner", id);
    expect(pending.analysis).toBeUndefined();
    expect(pending.analysisAttempt?.result?.turns).toHaveLength(2);
    const exposed = JSON.stringify((await get(id).expect(200)).body);
    for (const privateField of ["analysisRequests", "analysisAttempt", "payloadHash", "contentHash", "expectedVersion", "expiresAt", "conversation", "credential"]) expect(exposed).not.toContain(privateField);
    app = makeApp();
    const saved = await analyze(id, { requestId, resumeOnly: true }).expect(200);
    expect(saved.body.project.reviewRequest).toBeUndefined();
    expect(saved.body.project.analysis).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await store.get("owner", id)).conversation).toHaveLength(2);
  });

  it("recovers a lost successful save response without applying a review twice", async () => {
    const id = await create(); const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze");
    const complete = store.completeAnalysis.bind(store);
    vi.spyOn(store, "completeAnalysis").mockImplementationOnce(async (...args) => {
      await complete(...args); throw new Error("private transport detail after commit");
    });
    await analyze(id, { requestId }).expect(503);
    const saved = await store.get("owner", id);
    await draft(id).expect(200);
    await analyze(id, { requestId, resumeOnly: true }).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const recovered = await store.get("owner", id);
    expect(recovered.conversation).toEqual(saved.conversation);
    expect(recovered.version).toBe(saved.version + 1);
    expect(recovered.proposals[0]?.status).toBe("draft");
  });

  it("bounds result-write retries without regenerating, and requires a deliberate retry if persistence stays unknown", async () => {
    const id = await create(); await analyze(id).expect(200);
    const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze");
    const stage = vi.spyOn(store, "stageAnalysis").mockRejectedValue(new Error("private database detail"));
    const failed = await analyze(id, { requestId, clarification: "Quote 6 lights" }).expect(503);
    expect(stage).toHaveBeenCalledTimes(2);
    expect(failed.body.error).toMatchObject({ code: "REVIEW_OUTCOME_UNKNOWN", reviewRequest: { requestId, status: "unknown", retryAllowed: true } });
    await analyze(id, { requestId, resumeOnly: true }).expect(409);
    await analyze(id, { clarification: "Quote 6 lights" }).expect(409);
    expect(spy).toHaveBeenCalledTimes(1);
    stage.mockRestore();
    await analyze(id, { requestId: randomUUID(), retryOf: requestId }).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]?.[1]).toBe("Quote 6 lights");
    expect((await store.get("owner", id)).conversation).toHaveLength(4);
  });

  it("retries one failed result write using the same held output", async () => {
    const id = await create();
    const spy = vi.spyOn(provider, "analyze");
    const stage = vi.spyOn(store, "stageAnalysis").mockRejectedValueOnce(new Error("private transient error"));
    await analyze(id, { requestId: randomUUID() }).expect(200);
    expect(stage).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not redispatch a failed provider call through legacy replay or checking; deliberate retry can replace its clarification", async () => {
    const id = await create(); const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze").mockRejectedValueOnce(new AppError(502, "AI_UNAVAILABLE", "The review is unavailable."));
    const response = await analyze(id, { requestId, clarification: "Quote 6 lights" }).expect(502);
    expect(response.body.error.reviewRequest).toMatchObject({ requestId, status: "failed", retryAllowed: true });
    await analyze(id, { clarification: "Quote 6 lights" }).expect(409);
    await analyze(id, { requestId, resumeOnly: true }).expect(409);
    await analyze(id, { requestId: randomUUID(), retryOf: randomUUID() }).expect(409);
    await analyze(id, { requestId, retryOf: requestId }).expect(422);
    expect(spy).toHaveBeenCalledTimes(1);
    await analyze(id, { requestId: randomUUID(), retryOf: requestId, clarification: "Quote 4 lights" }).expect(200);
    expect(spy.mock.calls[1]?.[1]).toBe("Quote 4 lights");
  });

  it("exposes expired claims as unknown and never automatically starts another paid attempt", async () => {
    const id = await create(); const requestId = randomUUID();
    await store.beginAnalysis("owner", id, { requestId, clarification: "Quote 6 lights" });
    store.projects.get(id)!.analysisAttempt!.expiresAt = Date.now() - 1;
    const spy = vi.spyOn(provider, "analyze");
    expect((await get(id).expect(200)).body.project.reviewRequest).toMatchObject({ requestId, status: "unknown", retryAllowed: true });
    expect((await analyze(id, { requestId, resumeOnly: true }).expect(409)).body.error.code).toBe("REVIEW_RETRY_REQUIRED");
    await analyze(id, { clarification: "Quote 6 lights" }).expect(409);
    expect(spy).not.toHaveBeenCalled();
    await analyze(id, { requestId: randomUUID(), retryOf: requestId }).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe("Quote 6 lights");
  });

  it("keeps an intervening draft when a persisted generated result is resumed", async () => {
    const id = await create(); await analyze(id).expect(200);
    const requestId = randomUUID();
    const spy = vi.spyOn(provider, "analyze");
    vi.spyOn(store, "completeAnalysis").mockRejectedValueOnce(new Error("private database detail"));
    await analyze(id, { requestId, clarification: "Quote 4 lights" }).expect(503);
    await draft(id).expect(200);
    const response = await analyze(id, { requestId, resumeOnly: true }).expect(409);
    expect(response.body.error).toMatchObject({ code: "PROJECT_CHANGED", reviewRequest: { requestId, status: "stale", retryAllowed: true } });
    const saved = await store.get("owner", id);
    expect(saved.proposals[0]?.status).toBe("draft");
    expect(saved.proposals[0]?.quantity).toBe(6);
    expect(saved.conversation).toHaveLength(2);
    expect(saved.analysisAttempt?.result).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("denies another identity every recovery action without exposing request metadata", async () => {
    const id = await create(); const requestId = randomUUID();
    await store.beginAnalysis("owner", id, { requestId, clarification: "Quote 6 lights" });
    const spy = vi.spyOn(provider, "analyze");
    for (const body of [{ requestId, resumeOnly: true }, { requestId: randomUUID(), retryOf: requestId }, { clarification: "Quote 4 lights" }]) {
      const response = await request(app).post(`/api/projects/${id}/analyze`).set("Authorization", "Bearer other-token").send(body).expect(404);
      expect(response.body.error.reviewRequest).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain(requestId);
    }
    await request(app).post(`/api/projects/${id}/analyze`).send({ requestId, resumeOnly: true }).expect(401);
    expect(spy).not.toHaveBeenCalled();
  });
});
