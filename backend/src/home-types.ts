import type { DesignSelection, HouseDocument, HousePatch } from "@vibeestimate/scene-schema";

export type HomeBrief = { title: string; summary: string; source: "template" | "gemini" | "fixture"; assumptions: string[] };
export type HomeRevisionSummary = { id: string; parentRevisionId: string | null; title: string; description: string; createdAt: string; source: "template" | "manual" | "gemini" | "fixture" | "restore"; conflict: boolean; model?: string; changes?: string[] };
export type HomeRevision = HomeRevisionSummary & { scene: HouseDocument; brief: HomeBrief; requestId: string; prompt?: string; patch?: HousePatch };
export type HomeJob = {
  requestId: string; kind: "generate" | "summary" | "agreement";
  status: "running" | "save_pending" | "complete" | "failed" | "unknown" | "cancelled" | "conflict";
  baseRevisionId: string; phase: "planning" | "validating" | "saving" | "done";
  attemptsUsed: number; model?: string; error?: { code: string; message: string };
  resultRevisionId?: string; resultSummaryId?: string; startedAt: string; updatedAt: string;
};
export type HomeReviewSource = { startingRevisionId: string; acceptedDecisionId: string; approvedDecisionId: string; messages: { id: string; role: "designer" | "client"; text: string; createdAt: string }[]; changes: string[] };
export type HomeSummary = { id: string; revisionId: string; title: string; narrative: string; markdown: string; provider: "gemini" | "fixture"; model: string; createdAt: string; purpose?: "agreement"; reviewSource?: HomeReviewSource };
export type HomeProject = {
  id: string; title: string; createdAt: string; updatedAt: string; templateId: string | null;
  headRevisionId: string | null; scene: HouseDocument | null; brief: HomeBrief | null;
  revisions: HomeRevisionSummary[]; activeJob: HomeJob | null; summary: HomeSummary | null;
  proposalProjectId: string | null;
  roomId?: string;
};
export type HomeReceipt = { hash: string; kind: string; revisionId?: string; projectId?: string };
export type StoredHomeJob = HomeJob & { expiresAt: number; stagedRevisionId?: string; stagedSummary?: HomeSummary };
export type StoredHome = Omit<HomeProject, "scene" | "activeJob"> & {
  ownerId: string; receipts: Record<string, HomeReceipt>; jobs: Record<string, StoredHomeJob>;
  activeRequestId?: string; callsUsed: number;
};
export type HomeOwner = { homeIds: string[]; creations: Record<string, string>; callsUsed: number; active?: { homeId: string; requestId: string; expiresAt: number } };
export type HomeGenerationInput = { requestId: string; baseRevisionId: string; prompt: string; selection: DesignSelection };
export type HomeModelContext = { home: HomeProject; revision: HomeRevision; selection?: DesignSelection; prompt?: string; purpose?: "agreement"; assistant?: { name: string; instructions: string }; reviewSource?: HomeReviewSource };
export interface HomeAIProvider {
  readonly kind: "gemini" | "fixture";
  readonly models: readonly string[];
  generate(context: HomeModelContext, model: string): Promise<unknown>;
  summarize(context: HomeModelContext, model: string): Promise<{ title: string; narrative: string }>;
}

export function publicHomeJob(job: StoredHomeJob): HomeJob {
  const { requestId, kind, status, baseRevisionId, phase, attemptsUsed, model, error, resultRevisionId, resultSummaryId, startedAt, updatedAt } = job;
  return { requestId, kind, status, baseRevisionId, phase, attemptsUsed, ...(model ? { model } : {}), ...(error ? { error } : {}), ...(resultRevisionId ? { resultRevisionId } : {}), ...(resultSummaryId ? { resultSummaryId } : {}), startedAt, updatedAt };
}
