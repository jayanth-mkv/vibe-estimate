import { clientAuth, type SessionIdentity } from "./firebase";
import { serviceRequest } from "./service-request";
import type { DesignSelection, HouseDocument, HousePatch } from "@vibeestimate/scene-schema";
export type HomeBrief = { title: string; summary: string; source: "template" | "gemini" | "fixture"; assumptions: string[] };
export type HomeRevisionSummary = { id: string; parentRevisionId: string | null; title: string; description: string; createdAt: string; source: "template" | "manual" | "gemini" | "fixture" | "restore"; conflict: boolean };
export type HomeRevision = HomeRevisionSummary & { scene: HouseDocument; brief: HomeBrief; requestId: string; prompt?: string; patch?: HousePatch };
export type HomeJob = { requestId: string; kind: "generate" | "summary" | "agreement"; status: "running" | "save_pending" | "complete" | "failed" | "unknown" | "cancelled" | "conflict"; baseRevisionId: string; phase: "planning" | "validating" | "saving" | "done"; attemptsUsed: number; model?: string; error?: { code: string; message: string }; resultRevisionId?: string; startedAt: string; updatedAt: string };
export type HomeSummary = { revisionId: string; title: string; narrative: string; markdown: string; provider: "gemini" | "fixture"; model: string; createdAt: string };
export type HomeProject = { id: string; title: string; createdAt: string; updatedAt: string; templateId: string | null; headRevisionId: string | null; scene: HouseDocument | null; brief: HomeBrief | null; revisions: HomeRevisionSummary[]; activeJob: HomeJob | null; summary: HomeSummary | null; proposalProjectId: string | null; roomId?: string | null };
export function makeHomeApi(identity: SessionIdentity = "designer", roomId?: string) {
  function request<T>(path: string, body?: object, plain = false): Promise<T> { return serviceRequest(path, clientAuth(identity).currentUser, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, plain) as Promise<T>; }
  const path = (id: string) => roomId ? `/api/rooms/${encodeURIComponent(roomId)}/home` : `/api/homes/${encodeURIComponent(id)}`;
  return { request,
    list: () => request<{ homes: HomeProject[] }>("/api/homes"),
    create: (requestId: string) => request<{ home: HomeProject }>("/api/homes", { requestId }),
    get: (id: string) => request<{ home: HomeProject }>(path(id)),
    template: (id: string, templateId: string, baseRevisionId: string | null, requestId: string) => request<{ home: HomeProject }>(`${path(id)}/template`, { templateId, baseRevisionId, requestId }),
    generate: (id: string, prompt: string, selection: DesignSelection, baseRevisionId: string, requestId: string) => request<{ home: HomeProject; job?: HomeJob }>(`${path(id)}/generate`, { prompt, selection, baseRevisionId, requestId }),
    job: (id: string, requestId: string) => request<{ job: HomeJob; home?: HomeProject }>(`${path(id)}/jobs/${encodeURIComponent(requestId)}`),
    cancel: (id: string, requestId: string) => request<{ home: HomeProject }>(`${path(id)}/jobs/${encodeURIComponent(requestId)}/cancel`, { requestId }),
    resume: (id: string, requestId: string) => request<{ home: HomeProject; job?: HomeJob }>(`${path(id)}/jobs/${encodeURIComponent(requestId)}/resume`, { requestId }),
    revise: (id: string, patch: HousePatch, selection: DesignSelection, baseRevisionId: string, requestId: string) => request<{ home: HomeProject }>(`${path(id)}/revisions`, { patch, selection, baseRevisionId, requestId }),
    revision: (id: string, revisionId: string) => request<{ revision: HomeRevision }>(`${path(id)}/revisions/${encodeURIComponent(revisionId)}`),
    restore: (id: string, revisionId: string, baseRevisionId: string, requestId: string) => request<{ home: HomeProject }>(`${path(id)}/restore`, { revisionId, baseRevisionId, requestId }),
    summary: (id: string, baseRevisionId: string, requestId: string) => request<{ home: HomeProject }>(`${path(id)}/summary`, { baseRevisionId, requestId }),
    export: (id: string, revisionId: string) => request<string>(`${path(id)}/export?revisionId=${encodeURIComponent(revisionId)}`, undefined, true),
    proposal: (id: string, baseRevisionId: string, requestId: string) => request<{ project: { id: string } }>(`${path(id)}/proposal`, { baseRevisionId, requestId }),
  };
}
