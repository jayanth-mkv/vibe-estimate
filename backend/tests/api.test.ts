import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { FixtureProvider } from "../src/ai.js";
import { readConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { MemoryProjectStore } from "./helpers.js";

describe("authenticated project API (explicit in-memory test store)", () => {
  let store: MemoryProjectStore;
  let provider: FixtureProvider;
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    store = new MemoryProjectStore(); provider = new FixtureProvider();
    app = createApp({ config: readConfig({}), store, provider, verifyToken: async token => {
      if (!["owner-token", "other-token"].includes(token)) throw new Error("private auth error");
      return { uid: token === "owner-token" ? "owner" : "other" };
    } });
  });
  const input = { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES };
  const create = async () => {
    const response = await request(app).post("/api/projects").set("Authorization", "Bearer owner-token").send(input).expect(201);
    return response.body.project.id as string;
  };
  const analyze = (id: string, body = {}) => request(app).post(`/api/projects/${id}/analyze`).set("Authorization", "Bearer owner-token").send(body);

  it("labels fixture mode on public health and denies missing/invalid authentication", async () => {
    expect((await request(app).get("/health").expect(200)).body).toMatchObject({ aiProvider: "fixture", auth: "emulator" });
    await request(app).get("/api/projects").expect(401);
    const response = await request(app).get("/api/projects").set("Authorization", "Bearer forged-token").expect(401);
    expect(JSON.stringify(response.body)).not.toContain("private auth error");
  });
  it("isolates every project operation from a second user", async () => {
    const id = await create();
    const actions = [
      request(app).get(`/api/projects/${id}`),
      request(app).get(`/api/projects/${id}/export`),
      request(app).post(`/api/projects/${id}/analyze`).send({}),
      request(app).post(`/api/projects/${id}/proposals`).send({ quantity: 6, unitPricePaise: 200000, requestId: randomUUID() })
    ];
    for (const action of actions) {
      const response = await action.set("Authorization", "Bearer other-token").expect(404);
      expect(JSON.stringify(response.body)).not.toContain(input.scope);
    }
    expect((await request(app).get("/api/projects").set("Authorization", "Bearer other-token").expect(200)).body.projects).toEqual([]);
  });
  it("rejects client-supplied ownership and never returns internal conversation or request records", async () => {
    await request(app).post("/api/projects").set("Authorization", "Bearer owner-token").send({ ...input, ownerId: "other" }).expect(422);
    const id = await create();
    const response = await request(app).get(`/api/projects/${id}`).set("Authorization", "Bearer owner-token").expect(200);
    expect(response.body.project.ownerId).toBeUndefined();
    expect(response.body.project.requests).toBeUndefined();
    expect(response.body.project.conversation).toBeUndefined();
  });
  it("saves, analyzes, clarifies, revises, retries, reloads and exports the fixture", async () => {
    const id = await create();
    await analyze(id).expect(200);
    const clarified = await analyze(id, { clarification: "Quote 6 lights" }).expect(200);
    expect(clarified.body.project.analysis.questions).toEqual([]);
    const first = { quantity: 6, unitPricePaise: 200000, requestId: randomUUID(), description: "Display lights" };
    await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send(first).expect(200);
    await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send(first).expect(200);
    const revised = await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send({ ...first, quantity: 4, requestId: randomUUID() }).expect(200);
    expect(revised.body.project.proposals).toHaveLength(2);
    expect(revised.body.project.proposals[1].totalPaise).toBe(800000);
    const reloaded = await request(app).get(`/api/projects/${id}`).set("Authorization", "Bearer owner-token").expect(200);
    expect(reloaded.body.project.proposals).toEqual(revised.body.project.proposals);
    const exported = await request(app).get(`/api/projects/${id}/export`).set("Authorization", "Bearer owner-token").expect(200);
    expect(exported.text).toContain("₹8,000.00");
    expect(exported.text).toContain("not an invoice");
    expect(exported.headers["content-type"]).toContain("text/plain");
  });
  it("invalidates a prior draft when the owner changes the AI review", async () => {
    const id = await create(); await analyze(id).expect(200);
    await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send({ quantity: 6, unitPricePaise: 200000, requestId: randomUUID() }).expect(200);
    const response = await analyze(id, { clarification: "Quote 4 lights" }).expect(200);
    expect(response.body.project.proposals[0].status).toBe("superseded");
    await request(app).get(`/api/projects/${id}/export`).set("Authorization", "Bearer owner-token").expect(409);
  });
  it("does not replace a provider failure with a plausible fixture answer", async () => {
    const id = await create();
    vi.spyOn(provider, "analyze").mockRejectedValue(new AppError(502, "AI_UNAVAILABLE", "The AI review is unavailable right now."));
    await analyze(id).expect(502);
    expect((await store.get("owner", id)).analysis).toBeUndefined();
  });
  it("rejects a stale AI review when a draft is saved during the model call", async () => {
    const id = await create(); await analyze(id).expect(200);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const originalAnalyze = provider.analyze.bind(provider);
    vi.spyOn(provider, "analyze").mockImplementation(async (project, clarification) => {
      entered(); await waiting; return originalAnalyze(project, clarification);
    });
    const pending = analyze(id, { clarification: "Quote 4 lights" }).then(response => response);
    await started;
    await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send({ quantity: 6, unitPricePaise: 200000, requestId: randomUUID() }).expect(200);
    release();
    const response = await pending;
    expect(response.status).toBe(409);
    const saved = await store.get("owner", id);
    expect(saved.proposals[0]?.status).toBe("draft");
    expect(saved.proposals[0]?.quantity).toBe(6);
    expect(saved.conversation).toHaveLength(2);
  });
  it("returns a safe save failure without claiming the review was saved", async () => {
    const id = await create();
    vi.spyOn(store, "saveAnalysis").mockRejectedValue(new Error("private database credentials"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyze(id).expect(503);
    expect(JSON.stringify(response.body)).not.toContain("credentials");
    expect((await store.get("owner", id)).analysis).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain(input.messages);
    log.mockRestore();
  });
  it("rejects an unsupported fixture and missing rate without creating a draft", async () => {
    const response = await request(app).post("/api/projects").set("Authorization", "Bearer owner-token").send({ ...input, messages: "A different job needs new paint throughout the entire house." }).expect(201);
    await analyze(response.body.project.id).expect(422);
    const id = await create(); await analyze(id).expect(200);
    await request(app).post(`/api/projects/${id}/proposals`).set("Authorization", "Bearer owner-token").send({ quantity: 6, requestId: randomUUID() }).expect(422);
    expect((await store.get("owner", id)).proposals).toEqual([]);
  });
});
