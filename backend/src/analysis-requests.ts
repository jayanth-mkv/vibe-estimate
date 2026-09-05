import { createHash, randomUUID } from "node:crypto";
import { AppError } from "./errors.js";
import { publicReviewRequest, type Analysis, type AnalyzeInput, type ConversationTurn, type ReviewRequest, type StoredProject } from "./types.js";

export const ANALYSIS_LEASE_MS = 90_000;
export const ANALYSIS_REQUEST_LIMIT = 100;

export class ReviewRequestError extends AppError {
  constructor(status: number, code: string, message: string, public reviewRequest?: ReviewRequest) {
    super(status, code, message);
  }
}

export type AnalysisDecision =
  | { kind: "dispatch" | "save" | "complete"; project: StoredProject; requestId: string; clarification?: string }
  | { kind: "error"; project: StoredProject; error: ReviewRequestError };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const contentKey = (clarification?: string) => hash({ clarification: clarification ?? null });
const payloadKey = (input: AnalyzeInput) => hash({ clarification: input.clarification ?? null, retryOf: input.retryOf ?? null });

function failure(project: StoredProject, status: number, code: string, message: string, now: number): AnalysisDecision {
  return { kind: "error", project, error: new ReviewRequestError(status, code, message, publicReviewRequest(project, now)) };
}

function setStatus(project: StoredProject, status: ReviewRequest["status"]): StoredProject {
  const attempt = project.analysisAttempt!;
  const { result: _result, ...withoutResult } = attempt;
  return {
    ...project,
    analysisAttempt: { ...withoutResult, status },
    analysisRequests: { ...project.analysisRequests, [attempt.requestId]: { ...project.analysisRequests![attempt.requestId]!, status } }
  };
}

function currentAction(project: StoredProject, now: number): AnalysisDecision {
  const attempt = project.analysisAttempt!;
  if (attempt.status === "save_pending") return { kind: "save", project, requestId: attempt.requestId };
  if (attempt.status === "running") return failure(project, 409, "REVIEW_IN_PROGRESS", "This review is already running. Check its saved status before starting another review.", now);
  return failure(project, 409, "REVIEW_RETRY_REQUIRED", "This review did not finish. Check the saved project, then explicitly start a new review if you want to retry.", now);
}

function previousContentKey(project: StoredProject): string | undefined {
  if (project.lastAnalysisKey) return project.lastAnalysisKey;
  // Existing projects predate the receipt ledger. Their latest owner turn still
  // identifies an immediate duplicate without exposing the private transcript.
  const turn = project.conversation.findLast(item => item.role === "user");
  if (!turn) return project.analysis ? contentKey() : undefined;
  try {
    const parsed = JSON.parse(turn.text) as { ownerClarification?: unknown };
    if (parsed.ownerClarification === null) return contentKey();
    if (typeof parsed.ownerClarification === "string") return contentKey(parsed.ownerClarification.trim());
  } catch { /* Unrecognized historical content cannot establish a replay. */ }
  return undefined;
}

/** Pure transaction plan. Business failures return their state so expiry/CAS
 * decisions can be committed instead of disappearing in a rolled-back throw. */
export function beginAnalysis(project: StoredProject, input: AnalyzeInput, now = Date.now()): AnalysisDecision {
  if (project.analysisAttempt?.status === "running" && project.analysisAttempt.expiresAt <= now) project = setStatus(project, "unknown");
  const payloadHash = payloadKey(input);
  const contentHash = contentKey(input.clarification);
  const existing = input.requestId ? project.analysisRequests?.[input.requestId] : undefined;
  if (existing) {
    // A known ID with both optional action fields omitted is an explicit check /
    // save operation. Empty clarification is rejected by the input schema.
    const checkOnly = input.clarification === undefined && input.retryOf === undefined;
    if (!checkOnly && existing.payloadHash !== payloadHash) return failure(project, 409, "REQUEST_REUSED", "This review request was already used with different values. Start a new request for a different review.", now);
    if (existing.status === "complete") return { kind: "complete", project, requestId: input.requestId! };
    if (project.analysisAttempt?.requestId === input.requestId) return currentAction(project, now);
    return failure(project, 409, "REVIEW_RETRY_REQUIRED", "This earlier review was replaced by a deliberate retry. Check the current review before taking another action.", now);
  }
  if (input.resumeOnly) return failure(project, 404, "REVIEW_REQUEST_NOT_FOUND", "No saved review request matches this check. Start a review explicitly when you are ready.", now);
  const active = project.analysisAttempt;
  if (!input.requestId && active?.contentHash === contentHash) return currentAction(project, now);

  const cachedInitial = Boolean(project.analysis && !input.clarification && !input.retryOf);
  const cachedClarification = Boolean(project.analysis && !active && !input.retryOf && previousContentKey(project) === contentHash);
  if (cachedInitial || cachedClarification) {
    if (!input.requestId) return { kind: "complete", project, requestId: "" };
    if (Object.keys(project.analysisRequests ?? {}).length >= ANALYSIS_REQUEST_LIMIT) return failure(project, 422, "REVIEW_REQUEST_LIMIT", "This project has reached its review-request limit. Existing reviews and drafts remain available.", now);
    return {
      kind: "complete", requestId: input.requestId,
      project: { ...project, analysisRequests: { ...project.analysisRequests, [input.requestId]: { payloadHash, status: "complete" } } }
    };
  }

  if (active) {
    if (active.status === "running") return currentAction(project, now);
    if (active.status === "save_pending") return failure(project, 409, "REVIEW_SAVE_PENDING", "A generated review is waiting to be saved. Finish saving that review before starting another.", now);
    if (input.retryOf !== active.requestId) return currentAction(project, now);
  } else if (input.retryOf) return failure(project, 409, "INVALID_REVIEW_RETRY", "There is no interrupted review matching this retry. Reload the project first.", now);

  if (project.conversation.length >= 20) return failure(project, 422, "CONVERSATION_LIMIT", "This project has reached its ten-review conversation limit.", now);
  if (Object.keys(project.analysisRequests ?? {}).length >= ANALYSIS_REQUEST_LIMIT) return failure(project, 422, "REVIEW_REQUEST_LIMIT", "This project has reached its review-request limit. Existing reviews and drafts remain available.", now);
  const requestId = input.requestId ?? randomUUID();
  const clarification = input.clarification ?? (input.retryOf ? active?.clarification : undefined);
  return {
    kind: "dispatch", requestId, ...(clarification === undefined ? {} : { clarification }),
    project: {
      ...project,
      analysisRequests: { ...project.analysisRequests, [requestId]: { payloadHash, status: "running" } },
      analysisAttempt: { requestId, contentHash: contentKey(clarification), expectedVersion: project.version, expiresAt: now + ANALYSIS_LEASE_MS, status: "running", ...(clarification === undefined ? {} : { clarification }) }
    }
  };
}

function stale(project: StoredProject, now: number): AnalysisDecision {
  return failure(setStatus(project, "stale"), 409, "PROJECT_CHANGED", "The project changed while the review was running. Your saved draft is unchanged. Reload before explicitly starting another review.", now);
}

export function stageAnalysis(project: StoredProject, requestId: string, analysis: Analysis, conversation: ConversationTurn[], now = Date.now()): AnalysisDecision {
  if (project.analysisRequests?.[requestId]?.status === "complete") return { kind: "complete", project, requestId };
  const attempt = project.analysisAttempt;
  if (!attempt || attempt.requestId !== requestId) return failure(project, 409, "REVIEW_REPLACED", "A newer review replaced this request. Check the saved project.", now);
  if (project.version !== attempt.expectedVersion) return stale(project, now);
  if (attempt.status === "save_pending") return { kind: "save", project, requestId };
  if (attempt.status !== "running" && attempt.status !== "unknown") return currentAction(project, now);
  const prefix = conversation.slice(0, project.conversation.length);
  const turns = conversation.slice(project.conversation.length);
  if (JSON.stringify(prefix) !== JSON.stringify(project.conversation) || turns.length !== 2 || turns[0]?.role !== "user" || turns[1]?.role !== "model") throw new AppError(502, "AI_INVALID_RESPONSE", "The review conversation could not be verified.");
  return {
    kind: "save", requestId,
    project: {
      ...project,
      analysisAttempt: { ...attempt, status: "save_pending", result: { analysis, turns } },
      analysisRequests: { ...project.analysisRequests, [requestId]: { ...project.analysisRequests![requestId]!, status: "save_pending" } }
    }
  };
}

export function completeAnalysis(project: StoredProject, requestId: string, now = Date.now()): AnalysisDecision {
  if (project.analysisRequests?.[requestId]?.status === "complete") return { kind: "complete", project, requestId };
  const attempt = project.analysisAttempt;
  if (!attempt || attempt.requestId !== requestId) return failure(project, 409, "REVIEW_REPLACED", "A newer review replaced this request. Check the saved project.", now);
  if (project.version !== attempt.expectedVersion) return stale(project, now);
  if (attempt.status !== "save_pending" || !attempt.result) return currentAction(project, now);
  const { analysisAttempt: _attempt, ...rest } = project;
  return {
    kind: "complete", requestId,
    project: {
      ...rest, analysis: attempt.result.analysis, conversation: [...project.conversation, ...attempt.result.turns],
      proposals: project.proposals.map(proposal => ({ ...proposal, status: "superseded" })),
      version: project.version + 1, updatedAt: new Date(now).toISOString(), lastAnalysisKey: attempt.contentHash,
      analysisRequests: { ...project.analysisRequests, [requestId]: { ...project.analysisRequests![requestId]!, status: "complete" } }
    }
  };
}

export function failAnalysis(project: StoredProject, requestId: string, status: "failed" | "unknown"): StoredProject {
  // A write may have succeeded before its response failed. Never discard a
  // durably staged result, a completed receipt, or a newer owner's action.
  if (project.analysisAttempt?.requestId !== requestId || project.analysisAttempt.status !== "running") return project;
  return setStatus(project, status);
}
