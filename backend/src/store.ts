import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { notFound } from "./errors.js";
import { reviseProposal } from "./domain.js";
import { beginAnalysis, completeAnalysis, failAnalysis, stageAnalysis, type AnalysisDecision } from "./analysis-requests.js";
import type { Analysis, AnalyzeInput, ConversationTurn, CreateProjectInput, ProposalInput, StoredProject } from "./types.js";

export interface ProjectStore {
  list(uid: string): Promise<StoredProject[]>;
  create(uid: string, input: CreateProjectInput): Promise<StoredProject>;
  get(uid: string, id: string): Promise<StoredProject>;
  beginAnalysis(uid: string, id: string, input: AnalyzeInput): Promise<AnalysisDecision>;
  stageAnalysis(uid: string, id: string, requestId: string, analysis: Analysis, conversation: ConversationTurn[]): Promise<AnalysisDecision>;
  completeAnalysis(uid: string, id: string, requestId: string): Promise<AnalysisDecision>;
  failAnalysis(uid: string, id: string, requestId: string, status: "failed" | "unknown"): Promise<StoredProject>;
  appendProposal(uid: string, id: string, input: ProposalInput): Promise<StoredProject>;
}

export function newProject(uid: string, input: CreateProjectInput): StoredProject {
  const now = new Date().toISOString();
  return { ...input, id: randomUUID(), ownerId: uid, version: 0, createdAt: now, updatedAt: now, proposals: [], conversation: [], requests: {} };
}
export function assertOwner(project: StoredProject | undefined, uid: string): asserts project is StoredProject {
  if (!project || project.ownerId !== uid) throw notFound();
}

export class FirestoreProjectStore implements ProjectStore {
  constructor(private db: Firestore) {}
  private collection(uid: string) { return this.db.collection("users").doc(uid).collection("projects"); }
  async list(uid: string) {
    const snapshot = await this.collection(uid).orderBy("updatedAt", "desc").limit(100).get();
    return snapshot.docs.map(doc => doc.data() as StoredProject).filter(project => project.ownerId === uid);
  }
  async create(uid: string, input: CreateProjectInput) {
    const project = newProject(uid, input);
    await this.collection(uid).doc(project.id).create(project);
    return project;
  }
  async get(uid: string, id: string) {
    const snapshot = await this.collection(uid).doc(id).get();
    const project = snapshot.exists ? snapshot.data() as StoredProject : undefined;
    assertOwner(project, uid);
    return project;
  }
  private async reviewTransaction(uid: string, id: string, operation: (project: StoredProject) => AnalysisDecision) {
    const reference = this.collection(uid).doc(id);
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const project = snapshot.exists ? snapshot.data() as StoredProject : undefined;
      assertOwner(project, uid);
      const decision = operation(project);
      if (decision.project !== project) transaction.set(reference, decision.project);
      return decision;
    });
  }
  beginAnalysis(uid: string, id: string, input: AnalyzeInput) {
    return this.reviewTransaction(uid, id, project => beginAnalysis(project, input));
  }
  stageAnalysis(uid: string, id: string, requestId: string, analysis: Analysis, conversation: ConversationTurn[]) {
    return this.reviewTransaction(uid, id, project => stageAnalysis(project, requestId, analysis, conversation));
  }
  completeAnalysis(uid: string, id: string, requestId: string) {
    return this.reviewTransaction(uid, id, project => completeAnalysis(project, requestId));
  }
  async failAnalysis(uid: string, id: string, requestId: string, status: "failed" | "unknown") {
    const decision = await this.reviewTransaction(uid, id, project => ({ kind: "complete", requestId, project: failAnalysis(project, requestId, status) }));
    return decision.project;
  }
  async appendProposal(uid: string, id: string, input: ProposalInput) {
    const reference = this.collection(uid).doc(id);
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const project = snapshot.exists ? snapshot.data() as StoredProject : undefined;
      assertOwner(project, uid);
      const updated = reviseProposal(project, input);
      if (updated !== project) transaction.set(reference, updated);
      return updated;
    });
  }
}
