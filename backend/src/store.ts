import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AppError, notFound } from "./errors.js";
import { reviseProposal } from "./domain.js";
import type { Analysis, ConversationTurn, CreateProjectInput, ProposalInput, StoredProject } from "./types.js";

export interface ProjectStore {
  list(uid: string): Promise<StoredProject[]>;
  create(uid: string, input: CreateProjectInput): Promise<StoredProject>;
  get(uid: string, id: string): Promise<StoredProject>;
  saveAnalysis(uid: string, id: string, expectedVersion: number, analysis: Analysis, conversation: ConversationTurn[]): Promise<StoredProject>;
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
  async saveAnalysis(uid: string, id: string, expectedVersion: number, analysis: Analysis, conversation: ConversationTurn[]) {
    const reference = this.collection(uid).doc(id);
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const project = snapshot.exists ? snapshot.data() as StoredProject : undefined;
      assertOwner(project, uid);
      if (project.version !== expectedVersion) throw new AppError(409, "PROJECT_CHANGED", "The project changed while the review was running. Reload it and retry.");
      // A fresh review changes the basis for future drafts. Existing revision values remain historical.
      const updated: StoredProject = { ...project, analysis, conversation, proposals: project.proposals.map(proposal => ({ ...proposal, status: "superseded" })), version: project.version + 1, updatedAt: new Date().toISOString() };
      transaction.set(reference, updated);
      return updated;
    });
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
