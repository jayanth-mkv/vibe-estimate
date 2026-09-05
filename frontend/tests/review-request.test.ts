import { describe, expect, it, vi } from "vitest";
import { forgetReview, readReviewRequest, rememberReview, restoreReview, resumeReviewInput, retryReview, reviewInput, reviewStorageKey, startReview, withReviewMetadata, type PendingReview, type ReviewStorage } from "../src/lib/review-request";

const project = "d947f039-ef17-476d-af87-25dba2073685";
const otherProject = "e947f039-ef17-476d-af87-25dba2073685";
const first = "d947f039-ef17-476d-af87-25dba2073686";
const second = "d947f039-ef17-476d-af87-25dba2073687";
const pending = (): PendingReview => ({ requestId: first, status: "unknown", retryAllowed: false, clarification: "Quote six matte white lights." });
function storage(): ReviewStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

describe("durable review intent", () => {
  it("creates one UUID for a new action and checks that same request with an explicitly non-dispatching payload", () => {
    const createId = vi.fn(() => first);
    const action = startReview("  Quote six matte white lights.  ", null, createId);
    expect(reviewInput(action)).toEqual({ requestId: first, clarification: "Quote six matte white lights." });
    expect(resumeReviewInput(action)).toEqual({ requestId: first, resumeOnly: true });
    expect(resumeReviewInput(action)).toEqual({ requestId: first, resumeOnly: true });
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("blocks a new clarification while a request is unresolved, before generating another UUID", () => {
    const createId = vi.fn(() => second);
    expect(() => startReview("Different quantity", pending(), createId)).toThrow("Check the current review");
    expect(createId).not.toHaveBeenCalled();
  });

  it("only a server-confirmed retry creates a fresh UUID and names its predecessor", () => {
    const createId = vi.fn(() => second);
    expect(() => retryReview(pending(), createId)).toThrow("Check the review status");
    expect(createId).not.toHaveBeenCalled();
    const confirmed = withReviewMetadata(pending(), { requestId: first, status: "failed", retryAllowed: true });
    const retry = retryReview(confirmed, createId);
    expect(reviewInput(retry)).toEqual({ requestId: second, retryOf: first });
    expect(retry.clarification).toBe(pending().clarification);
    expect(retry.retryAllowed).toBe(false);
    expect(resumeReviewInput(retry)).toEqual({ requestId: second, resumeOnly: true });
    expect(() => retryReview(confirmed, () => first)).toThrow("new review request");
  });

  it("allows an explicit retry to correct failed text and keeps that intent recoverable without granting another retry", () => {
    const failed = withReviewMetadata(pending(), { requestId: first, status: "failed", retryAllowed: true });
    const correction = retryReview(failed, () => second, "  Quote 4 lights  ");
    expect(reviewInput(correction)).toEqual({ requestId: second, retryOf: first, clarification: "Quote 4 lights" });
    const saved = storage();
    rememberReview("correcting-owner", project, correction, saved);
    const recovered = restoreReview("correcting-owner", project, undefined, saved)!;
    expect(recovered.clarification).toBe("Quote 4 lights");
    expect(resumeReviewInput(recovered)).toEqual({ requestId: second, resumeOnly: true });
    expect(() => retryReview(recovered, () => first)).toThrow("Check the review status");
    expect(reviewInput(retryReview(failed, () => second, "   "))).toEqual({ requestId: second, retryOf: first });
    const createId = vi.fn(() => second);
    expect(() => retryReview(failed, createId, "x".repeat(1001))).toThrow("1,000");
    expect(createId).not.toHaveBeenCalled();
  });

  it("keeps a newer authoritative review active without attaching the older request's clarification", () => {
    const current = withReviewMetadata(pending(), { requestId: second, status: "running", retryAllowed: false });
    expect(current).toEqual({ requestId: second, status: "running", retryAllowed: false });
    expect(resumeReviewInput(current)).toEqual({ requestId: second, resumeOnly: true });
    expect(() => startReview("A different clarification", current, () => first)).toThrow("Check the current review");
  });

  it("retains the bounded original intent by user and project without persisting retry permission", () => {
    const saved = storage();
    const active = { ...pending(), status: "failed" as const, retryAllowed: true };
    expect(rememberReview("owner-a", project, active, saved)).toBe(true);
    const raw = saved.getItem(reviewStorageKey("owner-a", project))!;
    expect(JSON.parse(raw)).toEqual({ version: 1, requestId: first, clarification: pending().clarification });
    expect(restoreReview("owner-a", project, undefined, saved)).toEqual(pending());
    expect(restoreReview("owner-b", project, undefined, saved)).toBeNull();
    expect(restoreReview("owner-a", otherProject, undefined, saved)).toBeNull();
  });

  it("restores a reload's saved UUID and clarification, but ignores forged local retry metadata", () => {
    const saved = storage();
    saved.setItem(reviewStorageKey("reloaded-owner", project), JSON.stringify({ version: 1, requestId: first,
      clarification: "Keep the agreed kitchen lighting.", status: "failed", retryAllowed: true, privateResponse: "untrusted" }));
    expect(restoreReview("reloaded-owner", project, undefined, saved)).toEqual({ requestId: first, status: "unknown", retryAllowed: false,
      clarification: "Keep the agreed kitchen lighting." });
  });

  it("uses authoritative project metadata when local storage is unavailable or a newer request exists", () => {
    const blocked: ReviewStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(rememberReview("blocked-owner", project, pending(), blocked)).toBe(false);
    expect(restoreReview("blocked-owner", project, undefined, blocked)?.requestId).toBe(first);
    const server = { requestId: second, status: "unknown", retryAllowed: true };
    const recovered = restoreReview("another-browser", project, server, blocked)!;
    expect(recovered).toEqual(server);
    expect(reviewInput(retryReview(recovered, () => first))).toEqual({ requestId: first, retryOf: second });
    expect(restoreReview("blocked-owner", project, server, blocked)?.clarification).toBeUndefined();
  });

  it("finishes only the matching local request and cannot erase a newer pending action", () => {
    const saved = storage();
    rememberReview("finishing-owner", project, { ...pending(), requestId: second }, saved);
    expect(forgetReview("finishing-owner", project, first, saved)).toBe(false);
    expect(restoreReview("finishing-owner", project, undefined, saved)?.requestId).toBe(second);
    expect(forgetReview("finishing-owner", project, second, saved)).toBe(true);
    expect(restoreReview("finishing-owner", project, undefined, saved)).toBeNull();
  });

  it("keeps a memory tombstone if clearing browser storage fails", () => {
    const saved = storage();
    rememberReview("removal-owner", project, pending(), saved);
    expect(forgetReview("removal-owner", project, first, { ...saved, removeItem: () => { throw new Error("blocked"); } })).toBe(false);
    expect(restoreReview("removal-owner", project, undefined, saved)).toBeNull();
  });

  it.each(["not json", "x".repeat(4097), JSON.stringify({ version: 1, requestId: "bad-id" }),
    JSON.stringify({ version: 1, requestId: first, clarification: "x".repeat(1001) })])("ignores an invalid persisted record", value => {
    const saved: ReviewStorage = { getItem: () => value, setItem: vi.fn(), removeItem: vi.fn() };
    expect(restoreReview("invalid-record-owner", project, undefined, saved)).toBeNull();
  });

  it("allowlists public status fields and bounds retry hints without trusting a running retry flag", () => {
    expect(readReviewRequest({ requestId: first, status: "save_pending", retryAllowed: true, retryAfterMs: 1000,
      result: { credential: "private" }, providerPayload: "private", clarification: "private" }))
      .toEqual({ requestId: first, status: "save_pending", retryAllowed: false, retryAfterMs: 1000 });
    expect(readReviewRequest({ requestId: first, status: "failed", retryAllowed: true, retryAfterMs: 300001 }))
      .toEqual({ requestId: first, status: "failed", retryAllowed: true });
    expect(readReviewRequest({ requestId: first, status: "complete", retryAllowed: true })).toBeUndefined();
    expect(readReviewRequest({ requestId: first, status: "unknown", retryAllowed: "yes" })).toBeUndefined();
    expect(() => startReview("x".repeat(1001), null, () => first)).toThrow("1,000");
  });
});
