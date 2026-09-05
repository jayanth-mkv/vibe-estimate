export interface Analysis {
  summary: string;
  included: string[];
  proposed: string[];
  questions: string[];
  evidence: { source: "scope" | "messages"; quote: string }[];
  provider: "fixture" | "gemini";
}
export interface Proposal {
  id: string;
  description?: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  status: "draft" | "superseded";
  createdAt: string;
}
export type ReviewRequestStatus = "running" | "save_pending" | "failed" | "unknown" | "stale";
export interface ReviewRequest {
  requestId: string;
  status: ReviewRequestStatus;
  retryAllowed: boolean;
  retryAfterMs?: number;
}
export type ReviewInput =
  | { requestId: string; clarification?: string; retryOf?: string; resumeOnly?: never }
  | { requestId: string; resumeOnly: true; clarification?: never; retryOf?: never };
export interface Project {
  id: string;
  roomId?: string;
  name: string;
  scope: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
  analysis?: Analysis;
  reviewRequest?: ReviewRequest;
  proposals: Proposal[];
}
export interface Health {
  status: "ok";
  aiProvider: "fixture" | "gemini";
  storage: "firestore";
  auth: "emulator" | "firebase";
  storageConnection?: "cloud" | "emulator";
  runtime?: "local" | "connected" | "production";
}
