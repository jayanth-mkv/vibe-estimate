import type { ReviewInput, ReviewRequest, ReviewRequestStatus } from "./types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set<ReviewRequestStatus>(["running", "save_pending", "failed", "unknown", "stale"]);
const retryable = new Set<ReviewRequestStatus>(["failed", "unknown", "stale"]);
const remembered = new Map<string, string | null>();

export interface PendingReview extends ReviewRequest {
  clarification?: string;
  retryOf?: string;
  replaceClarification?: true;
}
export type ReviewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Only these bounded public fields may cross the API error boundary. */
export function readReviewRequest(value: unknown): ReviewRequest | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (typeof input.requestId !== "string" || !uuid.test(input.requestId)
    || typeof input.status !== "string" || !statuses.has(input.status as ReviewRequestStatus)
    || typeof input.retryAllowed !== "boolean") return;
  const status = input.status as ReviewRequestStatus;
  const result: ReviewRequest = { requestId: input.requestId, status, retryAllowed: retryable.has(status) && input.retryAllowed };
  if (typeof input.retryAfterMs === "number" && Number.isInteger(input.retryAfterMs)
    && input.retryAfterMs >= 0 && input.retryAfterMs <= 300_000) result.retryAfterMs = input.retryAfterMs;
  return result;
}

function sessionStorage(): ReviewStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

export function reviewStorageKey(uid: string, projectId: string): string {
  if (!uid || uid.length > 128 || !uuid.test(projectId)) throw new Error("The review needs a valid project session.");
  return `vibeestimate:review:${encodeURIComponent(uid)}:${projectId}`;
}

function readNote(value: string | null | undefined): PendingReview | null {
  if (!value || value.length > 4096) return null;
  try {
    const input = JSON.parse(value);
    if (input?.version !== 1 || typeof input.requestId !== "string" || !uuid.test(input.requestId)) return null;
    if (input.clarification !== undefined && (typeof input.clarification !== "string" || input.clarification.length > 1000)) return null;
    if (input.retryOf !== undefined && (typeof input.retryOf !== "string" || !uuid.test(input.retryOf))) return null;
    // Local storage never grants permission to make a new paid attempt.
    return { requestId: input.requestId, status: "unknown", retryAllowed: false,
      ...(input.clarification ? { clarification: input.clarification } : {}),
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
      ...(input.replaceClarification === true && input.retryOf && input.clarification ? { replaceClarification: true as const } : {}) };
  } catch { return null; }
}

export function rememberReview(uid: string, projectId: string, review: PendingReview, storage: ReviewStorage | null = sessionStorage()): boolean {
  const key = reviewStorageKey(uid, projectId);
  const publicReview = readReviewRequest(review);
  if (!publicReview || (review.clarification !== undefined && review.clarification.length > 1000)) return false;
  const note = JSON.stringify({ version: 1, requestId: publicReview.requestId,
    ...(review.clarification ? { clarification: review.clarification } : {}),
    ...(review.retryOf && uuid.test(review.retryOf) ? { retryOf: review.retryOf } : {}),
    ...(review.replaceClarification && review.retryOf && review.clarification ? { replaceClarification: true } : {}) });
  remembered.set(key, note);
  try { if (!storage) return false; storage.setItem(key, note); return true; } catch { return false; }
}

export function restoreReview(uid: string, projectId: string, serverValue?: unknown, storage: ReviewStorage | null = sessionStorage()): PendingReview | null {
  const key = reviewStorageKey(uid, projectId);
  let local = readNote(remembered.get(key));
  if (!remembered.has(key)) {
    try { local = readNote(storage?.getItem(key)); } catch { /* The server remains a recovery source. */ }
  }
  const server = readReviewRequest(serverValue);
  if (!server) return local;
  return withReviewMetadata(local, server);
}

export function forgetReview(uid: string, projectId: string, requestId: string, storage: ReviewStorage | null = sessionStorage()): boolean {
  const key = reviewStorageKey(uid, projectId);
  let local: PendingReview | null = null;
  try { local = readNote(remembered.has(key) ? remembered.get(key) : storage?.getItem(key)); } catch { /* Use the in-memory tombstone. */ }
  if (local && local.requestId !== requestId) return false;
  remembered.set(key, null);
  try { if (!storage) return false; storage.removeItem(key); return true; } catch { return false; }
}

export function withReviewMetadata(local: PendingReview | null, value: unknown): PendingReview {
  const metadata = readReviewRequest(value);
  if (!metadata) throw new Error("The review status could not be confirmed. Check it again.");
  return { ...metadata,
    ...(local?.requestId === metadata.requestId && local.clarification ? { clarification: local.clarification } : {}),
    ...(local?.requestId === metadata.requestId && local.retryOf ? { retryOf: local.retryOf } : {}),
    ...(local?.requestId === metadata.requestId && local.replaceClarification ? { replaceClarification: true as const } : {}) };
}

function newId(createId: () => string, previous?: string): string {
  const requestId = createId();
  if (!uuid.test(requestId) || requestId === previous) throw new Error("A new review request could not be prepared. Please try again.");
  return requestId;
}

export function startReview(clarification: string, pending: PendingReview | null, createId: () => string = () => crypto.randomUUID()): PendingReview {
  if (pending) throw new Error("Check the current review before starting another one.");
  const text = clarification.trim();
  if (text.length > 1000) throw new Error("Keep the clarification to 1,000 characters or fewer.");
  return { requestId: newId(createId), status: "unknown", retryAllowed: false, ...(text ? { clarification: text } : {}) };
}

export function retryReview(pending: PendingReview, createId: () => string = () => crypto.randomUUID(), clarification?: string): PendingReview {
  if (!pending.retryAllowed || !retryable.has(pending.status)) throw new Error("Check the review status before retrying.");
  const replacement = clarification?.trim();
  if (replacement && replacement.length > 1000) throw new Error("Keep the clarification to 1,000 characters or fewer.");
  return { requestId: newId(createId, pending.requestId), retryOf: pending.requestId, status: "unknown", retryAllowed: false,
    ...(replacement && replacement !== pending.clarification ? { clarification: replacement, replaceClarification: true as const }
      : pending.clarification ? { clarification: pending.clarification } : {}) };
}

export function reviewInput(pending: PendingReview): ReviewInput {
  // The server owns the original clarification for a retry, including recovery
  // from another browser or unavailable session storage.
  return pending.retryOf ? { requestId: pending.requestId, retryOf: pending.retryOf,
    ...(pending.replaceClarification && pending.clarification ? { clarification: pending.clarification } : {}) }
    : { requestId: pending.requestId, ...(pending.clarification ? { clarification: pending.clarification } : {}) };
}

export function resumeReviewInput(pending: Pick<PendingReview, "requestId">): ReviewInput {
  return { requestId: pending.requestId, resumeOnly: true };
}
