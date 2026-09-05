import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { ANALYSIS_REQUEST_LIMIT } from "../src/analysis-requests.js";
import { FixtureProvider } from "../src/ai.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { FirestoreProjectStore } from "../src/store.js";
import { publicProject, type StoredProject } from "../src/types.js";

type Ref = { path: string };
/** Serialized, rollback-capable Firestore transport double. These tests exercise
 * the real store adapter without connecting to a shared emulator or cloud. */
class TransactionDatabase {
  documents = new Map<string, StoredProject>();
  writes: string[] = [];
  failBeforeCommit = false;
  private tail: Promise<unknown> = Promise.resolve();
  private snapshot(path: string) {
    return { exists: this.documents.has(path), data: () => structuredClone(this.documents.get(path)) };
  }
  collection(path: string): { doc: (id: string) => unknown } {
    return { doc: id => {
      const key = `${path}/${id}`;
      return { path: key, collection: (name: string) => this.collection(`${key}/${name}`), get: async () => this.snapshot(key), create: async (value: StoredProject) => { this.documents.set(key, structuredClone(value)); } };
    } };
  }
  runTransaction<T>(operation: (transaction: { get: (reference: Ref) => Promise<ReturnType<TransactionDatabase["snapshot"]>>; set: (reference: Ref, value: StoredProject) => void }) => Promise<T>): Promise<T> {
    const execute = async () => {
      const pending = new Map<string, StoredProject>();
      const result = await operation({
        get: async reference => this.snapshot(reference.path),
        set: (reference, value) => { pending.set(reference.path, structuredClone(value)); }
      });
      if (this.failBeforeCommit) { this.failBeforeCommit = false; throw new Error("synthetic transaction transport failure"); }
      for (const [path, value] of pending) { this.documents.set(path, value); this.writes.push(path); }
      return result;
    };
    const result = this.tail.then(execute, execute);
    this.tail = result.catch(() => {});
    return result;
  }
}

const input = { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES };
const keyFor = (id: string) => `users/owner/projects/${id}`;
async function setup() {
  const db = new TransactionDatabase();
  const store = new FirestoreProjectStore(db as unknown as Firestore);
  const project = await store.create("owner", input);
  return { db, store, id: project.id, provider: new FixtureProvider() };
}

describe("durable review Firestore transactions", () => {
  it("serializes same and different first requests into one persisted dispatch claim", async () => {
    const { db, store, id } = await setup();
    const requestId = randomUUID();
    const decisions = await Promise.all([
      store.beginAnalysis("owner", id, { requestId }),
      store.beginAnalysis("owner", id, { requestId }),
      store.beginAnalysis("owner", id, { requestId: randomUUID(), clarification: "Quote 4 lights" })
    ]);
    expect(decisions.map(decision => decision.kind)).toEqual(["dispatch", "error", "error"]);
    expect(db.writes).toEqual([keyFor(id)]);
    const saved = await store.get("owner", id);
    expect(Object.keys(saved.analysisRequests!)).toEqual([requestId]);
    expect(saved.version).toBe(0);
    expect(saved.conversation).toEqual([]);
  });

  it("rolls back an uncommitted claim and safely reports its check as absent", async () => {
    const { db, store, id } = await setup(); const requestId = randomUUID();
    db.failBeforeCommit = true;
    await expect(store.beginAnalysis("owner", id, { requestId })).rejects.toThrow("synthetic");
    expect((await store.get("owner", id)).analysisAttempt).toBeUndefined();
    const check = await store.beginAnalysis("owner", id, { requestId, resumeOnly: true });
    expect(check).toMatchObject({ kind: "error", error: { code: "REVIEW_REQUEST_NOT_FOUND" } });
    expect(db.writes).toEqual([]);
  });

  it("commits expired status even when the request returns a business error, and fences a late replaced result", async () => {
    const { db, store, id, provider } = await setup(); const firstId = randomUUID();
    const first = await store.beginAnalysis("owner", id, { requestId: firstId, clarification: "Quote 6 lights" });
    if (first.kind !== "dispatch") throw new Error("Expected a synthetic claim");
    const late = await provider.analyze(first.project, first.clarification);
    db.documents.get(keyFor(id))!.analysisAttempt!.expiresAt = Date.now() - 1;
    expect(await store.beginAnalysis("owner", id, { requestId: firstId, resumeOnly: true })).toMatchObject({ kind: "error", error: { code: "REVIEW_RETRY_REQUIRED" } });
    expect((await store.get("owner", id)).analysisRequests![firstId]?.status).toBe("unknown");
    const retryId = randomUUID();
    const retry = await store.beginAnalysis("owner", id, { requestId: retryId, retryOf: firstId, clarification: "Quote 4 lights" });
    expect(retry.kind).toBe("dispatch");
    expect(await store.stageAnalysis("owner", id, firstId, late.analysis, late.conversation)).toMatchObject({ kind: "error", error: { code: "REVIEW_REPLACED" } });
    await store.failAnalysis("owner", id, firstId, "failed");
    expect((await store.get("owner", id)).analysisAttempt).toMatchObject({ requestId: retryId, status: "running" });
    if (retry.kind !== "dispatch") throw new Error("Expected a synthetic retry");
    const result = await provider.analyze(retry.project, retry.clarification);
    await store.stageAnalysis("owner", id, retryId, result.analysis, result.conversation);
    await store.completeAnalysis("owner", id, retryId);
    expect(await store.beginAnalysis("owner", id, { requestId: firstId, resumeOnly: true })).toMatchObject({ kind: "error", error: { code: "REVIEW_RETRY_REQUIRED" } });
    expect((await store.get("owner", id)).conversation).toHaveLength(2);
  });

  it("retains just the generated delta, never downgrades it on a delayed failure, and applies it once", async () => {
    const { store, id, provider } = await setup();
    for (const clarification of [undefined, "Quote 6 lights"]) {
      const requestId = randomUUID();
      const claim = await store.beginAnalysis("owner", id, { requestId, ...(clarification ? { clarification } : {}) });
      if (claim.kind !== "dispatch") throw new Error("Expected a synthetic claim");
      const result = await provider.analyze(claim.project, clarification);
      await store.stageAnalysis("owner", id, requestId, result.analysis, result.conversation);
      await store.failAnalysis("owner", id, requestId, "unknown");
      const staged = await store.get("owner", id);
      expect(staged.analysisAttempt?.status).toBe("save_pending");
      expect(staged.analysisAttempt?.result?.turns).toHaveLength(2);
      expect(staged.conversation).toHaveLength(clarification ? 2 : 0);
      const completed = await store.completeAnalysis("owner", id, requestId);
      expect(await store.completeAnalysis("owner", id, requestId)).toEqual(completed);
      expect(await store.stageAnalysis("owner", id, requestId, result.analysis, result.conversation)).toEqual(completed);
    }
    const project = await store.get("owner", id);
    expect(project.version).toBe(2);
    expect(project.conversation).toHaveLength(4);
    expect(project.analysisAttempt).toBeUndefined();
  });

  it("persists a stale decision without superseding the draft committed during generation", async () => {
    const { store, id, provider } = await setup();
    const initialId = randomUUID();
    const initial = await store.beginAnalysis("owner", id, { requestId: initialId });
    const result = await provider.analyze(initial.project);
    await store.stageAnalysis("owner", id, initialId, result.analysis, result.conversation);
    await store.completeAnalysis("owner", id, initialId);
    const requestId = randomUUID();
    const claim = await store.beginAnalysis("owner", id, { requestId, clarification: "Quote 4 lights" });
    const generated = await provider.analyze(claim.project, "Quote 4 lights");
    const draft = await store.appendProposal("owner", id, { requestId: randomUUID(), quantity: 6, unitPricePaise: 200000 });
    expect(await store.stageAnalysis("owner", id, requestId, generated.analysis, generated.conversation)).toMatchObject({ kind: "error", error: { code: "PROJECT_CHANGED" } });
    const saved = await store.get("owner", id);
    expect(saved.analysisAttempt?.status).toBe("stale");
    expect(saved.analysisRequests![requestId]?.status).toBe("stale");
    expect(saved.proposals).toEqual(draft.proposals);
    expect(saved.conversation).toEqual(draft.conversation);
    expect(saved.version).toBe(draft.version);
  });

  it("bounds its receipt ledger while leaving completed checks available", async () => {
    const { db, store, id, provider } = await setup();
    const requestId = randomUUID();
    const claim = await store.beginAnalysis("owner", id, { requestId });
    const result = await provider.analyze(claim.project);
    await store.stageAnalysis("owner", id, requestId, result.analysis, result.conversation);
    await store.completeAnalysis("owner", id, requestId);
    const project = db.documents.get(keyFor(id))!;
    for (let index = 1; index < ANALYSIS_REQUEST_LIMIT; index++) project.analysisRequests![randomUUID()] = { payloadHash: "synthetic receipt", status: "complete" };
    const before = structuredClone(project);
    expect(await store.beginAnalysis("owner", id, { requestId: randomUUID(), clarification: "Quote 6 lights" })).toMatchObject({ kind: "error", error: { code: "REVIEW_REQUEST_LIMIT" } });
    expect(await store.beginAnalysis("owner", id, { requestId, resumeOnly: true })).toMatchObject({ kind: "complete" });
    expect(await store.get("owner", id)).toEqual(before);
  });

  it("rejects all recovery writes when the stored owner does not match the verified namespace", async () => {
    const { db, store, id, provider } = await setup(); const requestId = randomUUID();
    const claim = await store.beginAnalysis("owner", id, { requestId });
    const result = await provider.analyze(claim.project);
    db.documents.set(`users/other/projects/${id}`, structuredClone(claim.project));
    const writes = [...db.writes];
    for (const operation of [
      () => store.beginAnalysis("other", id, { requestId, resumeOnly: true }),
      () => store.stageAnalysis("other", id, requestId, result.analysis, result.conversation),
      () => store.completeAnalysis("other", id, requestId),
      () => store.failAnalysis("other", id, requestId, "failed")
    ]) await expect(operation()).rejects.toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
    expect(db.writes).toEqual(writes);
  });

  it("projects only public fields even if stored data gains another private field", async () => {
    const { store, id } = await setup();
    const claim = await store.beginAnalysis("owner", id, { requestId: randomUUID(), clarification: "Quote 6 lights" });
    const unanticipated = { ...claim.project, privateFutureField: "never expose", analysisAttempt: { ...claim.project.analysisAttempt!, result: { analysis: { summary: "hidden" }, turns: [{ role: "model", text: "hidden serialized output" }] } } };
    const serialized = JSON.stringify(publicProject(unanticipated as StoredProject));
    for (const text of ["privateFutureField", "never expose", "analysisAttempt", "analysisRequests", "hidden", "Quote 6 lights", "contentHash", "payloadHash", "expectedVersion"]) expect(serialized).not.toContain(text);
    expect(publicProject(claim.project).reviewRequest).toMatchObject({ status: "running", retryAllowed: false });
  });
});
