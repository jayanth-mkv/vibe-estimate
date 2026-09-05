import { reviseProposal } from "../src/domain.js";
import { beginAnalysis, completeAnalysis, failAnalysis, stageAnalysis, type AnalysisDecision } from "../src/analysis-requests.js";
import { assertOwner, newProject, type ProjectStore } from "../src/store.js";
import type { Analysis, AnalyzeInput, ConversationTurn, CreateProjectInput, ProposalInput, StoredProject } from "../src/types.js";

// API unit tests use this explicit test double. Root emulator integration tests exercise Firestore itself.
export class MemoryProjectStore implements ProjectStore {
  projects = new Map<string, StoredProject>();
  async list(uid: string) { return [...this.projects.values()].filter(project => project.ownerId === uid).map(project => structuredClone(project)); }
  async create(uid: string, input: CreateProjectInput) {
    const project = newProject(uid, input); this.projects.set(project.id, project); return structuredClone(project);
  }
  async get(uid: string, id: string) {
    const project = this.projects.get(id); assertOwner(project, uid); return structuredClone(project);
  }
  private reviewTransaction(uid: string, id: string, operation: (project: StoredProject) => AnalysisDecision) {
    const project = this.projects.get(id); assertOwner(project, uid);
    const decision = operation(project);
    this.projects.set(id, structuredClone(decision.project));
    return { ...decision, project: structuredClone(decision.project) };
  }
  async beginAnalysis(uid: string, id: string, input: AnalyzeInput) {
    return this.reviewTransaction(uid, id, project => beginAnalysis(project, input));
  }
  async stageAnalysis(uid: string, id: string, requestId: string, analysis: Analysis, conversation: ConversationTurn[]) {
    return this.reviewTransaction(uid, id, project => stageAnalysis(project, requestId, analysis, conversation));
  }
  async completeAnalysis(uid: string, id: string, requestId: string) {
    return this.reviewTransaction(uid, id, project => completeAnalysis(project, requestId));
  }
  async failAnalysis(uid: string, id: string, requestId: string, status: "failed" | "unknown") {
    return this.reviewTransaction(uid, id, project => ({ kind: "complete", requestId, project: failAnalysis(project, requestId, status) })).project;
  }
  async appendProposal(uid: string, id: string, input: ProposalInput) {
    const project = this.projects.get(id); assertOwner(project, uid);
    const updated = reviseProposal(project, input); this.projects.set(id, updated); return structuredClone(updated);
  }
}
