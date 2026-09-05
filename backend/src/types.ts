export type Evidence = { source: "scope" | "messages"; quote: string };
export type Analysis = {
  summary: string;
  included: string[];
  proposed: string[];
  questions: string[];
  evidence: Evidence[];
  provider: "fixture" | "gemini";
};
export type Proposal = {
  id: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  status: "draft" | "superseded";
  createdAt: string;
};
export type Project = {
  id: string;
  /** Server-assigned origin for a frozen shared-room review. It grants no room membership. */
  roomId?: string;
  name: string;
  scope: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
  analysis?: Analysis;
  proposals: Proposal[];
  /** Safe recovery controls for the owner's current review; never its prompt or result. */
  reviewRequest?: ReviewRequest;
};
export type ConversationTurn = { role: "user" | "model"; text: string };
export type AnalyzeInput = { clarification?: string; requestId?: string; retryOf?: string; resumeOnly?: true };
export type ReviewRequest = {
  requestId: string;
  status: "running" | "save_pending" | "failed" | "unknown" | "stale";
  retryAllowed: boolean;
  retryAfterMs?: number;
};
export type AnalysisReceipt = { payloadHash: string; status: ReviewRequest["status"] | "complete" };
export type AnalysisAttempt = {
  requestId: string;
  contentHash: string;
  expectedVersion: number;
  expiresAt: number;
  status: ReviewRequest["status"];
  clarification?: string;
  /** Only new turns are retained; do not duplicate the accumulated conversation. */
  result?: { analysis: Analysis; turns: ConversationTurn[] };
};
export type ProposalInput = { quantity: number; unitPricePaise: number; requestId: string; description?: string };
export type StoredProject = Omit<Project, "reviewRequest"> & {
  ownerId: string;
  version: number;
  conversation: ConversationTurn[];
  requests: Record<string, { quantity: number; unitPricePaise: number; proposalId: string; description: string }>;
  analysisRequests?: Record<string, AnalysisReceipt>;
  analysisAttempt?: AnalysisAttempt;
  lastAnalysisKey?: string;
};
export type CreateProjectInput = Pick<Project, "name" | "scope" | "messages">;

export function publicReviewRequest(stored: StoredProject, now = Date.now()): ReviewRequest | undefined {
  const attempt = stored.analysisAttempt;
  if (!attempt) return undefined;
  const status = attempt.status === "running" && attempt.expiresAt <= now ? "unknown" : attempt.status;
  return {
    requestId: attempt.requestId, status,
    retryAllowed: status === "failed" || status === "unknown" || status === "stale",
    ...(status === "running" ? { retryAfterMs: Math.max(0, attempt.expiresAt - now) } : {})
  };
}

export function publicProject(stored: StoredProject): Project {
  // Explicit projection prevents current or future private request state from leaking.
  const { id, roomId, name, scope, messages, createdAt, updatedAt, analysis, proposals } = stored;
  const reviewRequest = publicReviewRequest(stored);
  return { id, ...(roomId ? { roomId } : {}), name, scope, messages, createdAt, updatedAt, ...(analysis ? { analysis } : {}), proposals, ...(reviewRequest ? { reviewRequest } : {}) };
}
