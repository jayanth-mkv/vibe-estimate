import { readReviewRequest } from "./review-request";
import type { ReviewRequest } from "./types";

/** Browser requests stay on the page's origin unless an operator explicitly overrides it. */
export const serviceUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

type Session = { getIdToken: () => Promise<string> } | null;

const reviewErrorCodes = new Set([
  "REVIEW_IN_PROGRESS", "REVIEW_RETRY_REQUIRED", "REVIEW_SAVE_PENDING", "REVIEW_OUTCOME_UNKNOWN",
  "REVIEW_REQUEST_NOT_FOUND", "REVIEW_REPLACED", "INVALID_REVIEW_RETRY", "REVIEW_REQUEST_LIMIT",
  "REQUEST_REUSED", "PROJECT_CHANGED", "AI_UNAVAILABLE", "AI_INVALID_RESPONSE",
  "FIXTURE_UNSUPPORTED", "ROOM_FIXTURE_UNSUPPORTED", "CLARIFICATION_REQUIRED", "CONVERSATION_LIMIT"
]);

export class ServiceError extends Error {
  readonly code?: string;
  readonly reviewRequest?: ReviewRequest;

  constructor(message: string, code?: string, reviewRequest?: ReviewRequest) {
    super(message);
    this.name = "ServiceError";
    this.code = code && reviewErrorCodes.has(code) ? code : undefined;
    this.reviewRequest = readReviewRequest(reviewRequest);
  }
}

export async function serviceRequest(path: string, user: Session, options?: RequestInit, plain = false) {
  if (!user) throw new Error("Your session has ended. Reconnect to continue. Your inputs are still here.");
  let token: string;
  try { token = await user.getIdToken(); }
  catch { throw new Error("Your session could not reconnect. Keep this page open, check your connection, and try again. Your inputs are still here."); }
  let response: Response;
  try {
    response = await fetch(`${serviceUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers, Authorization: `Bearer ${token}` },
      signal: options?.signal ?? AbortSignal.timeout(65000), cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new Error("This is taking longer than expected. Your inputs are still here. Check your saved work before retrying.");
    }
    throw new Error("We could not connect. Your inputs are still here. Check your connection and try again.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message;
    const code = typeof payload?.error?.code === "string" && reviewErrorCodes.has(payload.error.code) ? payload.error.code : undefined;
    throw new ServiceError(typeof message === "string" && message.length > 0 && message.length < 600
      ? message : "This action could not be completed. Your inputs are still here. Please try again.", code,
    readReviewRequest(payload?.error?.reviewRequest));
  }
  return plain ? response.text() : response.json();
}
