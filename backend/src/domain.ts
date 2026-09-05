import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors.js";
import type { Analysis, ProposalInput, StoredProject } from "./types.js";

export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(100), scope: z.string().trim().min(10).max(12000), messages: z.string().trim().min(10).max(16000) }).strict();
export const analyzeSchema = z.object({ clarification: z.string().trim().min(1).max(1000).optional() }).strict();
export const proposalSchema = z.object({ quantity: z.number().int().min(1).max(1000), unitPricePaise: z.number().int().min(1).max(100000000), requestId: z.string().uuid(), description: z.string().trim().min(1).max(300).optional() }).strict();
export const analysisSchema = z.object({
  summary: z.string().min(1).max(1500),
  included: z.array(z.string().min(1).max(700)).max(12),
  proposed: z.array(z.string().min(1).max(700)).max(12),
  questions: z.array(z.string().min(1).max(700)).max(8),
  evidence: z.array(z.object({ source: z.enum(["scope", "messages"]), quote: z.string().min(8).max(1000) }).strict()).min(1).max(20)
}).strict();

export function validateAnalysis(value: unknown, project: StoredProject, provider: Analysis["provider"]): Analysis {
  const result = analysisSchema.safeParse(value);
  if (!result.success || result.data.evidence.some(evidence => !project[evidence.source].includes(evidence.quote))) {
    throw new AppError(502, "AI_INVALID_RESPONSE", "The review could not be verified against your source text. Your project is unchanged; please retry.");
  }
  return { ...result.data, provider };
}

export function reviseProposal(project: StoredProject, input: ProposalInput): StoredProject {
  const description = input.description ?? "Owner-reviewed proposed addition";
  const existing = project.requests[input.requestId];
  if (existing) {
    if (existing.quantity !== input.quantity || existing.unitPricePaise !== input.unitPricePaise || existing.description !== description) throw new AppError(409, "REQUEST_REUSED", "This save request was already used with different values. Please start a new revision.");
    return project;
  }
  if (!project.analysis || project.analysis.proposed.length === 0) throw new AppError(409, "ANALYSIS_REQUIRED", "Review the source text and identify a proposed addition before creating a draft.");
  if (project.proposals.length >= 100) throw new AppError(422, "REVISION_LIMIT", "This project has reached the local foundation's 100-revision limit.");
  const totalPaise = input.quantity * input.unitPricePaise;
  if (!Number.isSafeInteger(totalPaise)) throw new AppError(422, "INVALID_TOTAL", "The total is outside the supported amount range.");
  const createdAt = new Date().toISOString();
  const proposal = { id: randomUUID(), description, quantity: input.quantity, unitPricePaise: input.unitPricePaise, totalPaise, status: "draft" as const, createdAt };
  return {
    ...project,
    proposals: [...project.proposals.map(previous => ({ ...previous, status: "superseded" as const })), proposal],
    requests: { ...project.requests, [input.requestId]: { quantity: input.quantity, unitPricePaise: input.unitPricePaise, proposalId: proposal.id, description } },
    updatedAt: createdAt,
    version: project.version + 1
  };
}

const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
export function exportProposal(project: StoredProject): string {
  const proposal = project.proposals.findLast(item => item.status === "draft");
  if (!proposal) throw new AppError(409, "DRAFT_REQUIRED", "Create a draft before downloading a proposal.");
  return [
    "VibeEstimate — DRAFT PROPOSAL", project.name, `Revision ${project.proposals.length} • ${proposal.createdAt}`,
    "", "Client approval has not been collected. This is a proposal, not an invoice.",
    "", "Owner-reviewed proposed addition:", proposal.description,
    `Quantity: ${proposal.quantity}`, `Unit price: ${inr(proposal.unitPricePaise)}`, `Draft total: ${inr(proposal.totalPaise)}`,
    "Tax treatment is not recorded in this draft; confirm before agreement.",
    "", "Already included (excluded from this extra):", ...(project.analysis?.included ?? []),
    "", "Original agreed scope:", project.scope,
    "", "Source evidence:", ...(project.analysis?.evidence.map(item => `[${item.source}] ${item.quote}`) ?? []),
    "", "Original client messages:", project.messages, ""
  ].join("\n");
}
