import { AppError } from "../src/errors.js";
import { reviseProposal } from "../src/domain.js";
import { assertOwner, newProject, type ProjectStore } from "../src/store.js";
import type { Analysis, ConversationTurn, CreateProjectInput, ProposalInput, StoredProject } from "../src/types.js";

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
  async saveAnalysis(uid: string, id: string, expectedVersion: number, analysis: Analysis, conversation: ConversationTurn[]) {
    const project = this.projects.get(id); assertOwner(project, uid);
    if (project.version !== expectedVersion) throw new AppError(409, "PROJECT_CHANGED", "The project changed while the review was running. Reload it and retry.");
    const updated: StoredProject = { ...project, analysis, conversation, proposals: project.proposals.map(proposal => ({ ...proposal, status: "superseded" })), version: project.version + 1, updatedAt: new Date().toISOString() };
    this.projects.set(id, updated); return structuredClone(updated);
  }
  async appendProposal(uid: string, id: string, input: ProposalInput) {
    const project = this.projects.get(id); assertOwner(project, uid);
    const updated = reviseProposal(project, input); this.projects.set(id, updated); return structuredClone(updated);
  }
}
