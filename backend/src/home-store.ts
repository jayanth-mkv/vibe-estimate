import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AppError } from "./errors.js";
import type { StoredProject } from "./types.js";
import { publicHomeJob, type HomeJob, type HomeOwner, type HomeProject, type HomeRevision, type HomeSummary, type StoredHome } from "./home-types.js";

export const HOME_LIMITS = { homes: 20, revisions: 80, requests: 100, homeCalls: 24, ownerCalls: 60, leaseMs: 55_000, chunkBytes: 128 * 1024 } as const;
export const homeHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const missing = () => new AppError(404, "HOME_NOT_FOUND", "This home project could not be found.");
const ownerOf = (home: StoredHome | undefined, uid: string): StoredHome => { if (!home || home.ownerId !== uid) throw missing(); return home; };
const emptyOwner = (): HomeOwner => ({ homeIds: [], creations: {}, callsUsed: 0 });
const revisionSummary = ({ id, parentRevisionId, title, description, createdAt, source, conflict, model, changes }: HomeRevision) => ({ id, parentRevisionId, title, description, createdAt, source, conflict, ...(model ? { model } : {}), ...(changes ? { changes } : {}) });

export interface HomeTransaction {
  getHome(uid: string, id: string): Promise<StoredHome | undefined>;
  putHome(home: StoredHome): void;
  getOwner(uid: string): Promise<HomeOwner>;
  putOwner(uid: string, owner: HomeOwner): void;
  getProject(uid: string, id: string): Promise<StoredProject | undefined>;
  putProject(project: StoredProject): void;
}
export interface HomeDatabase {
  transaction<T>(operation: (transaction: HomeTransaction) => Promise<T>): Promise<T>;
  list(uid: string): Promise<StoredHome[]>;
  putRevision(uid: string, homeId: string, revision: HomeRevision): Promise<void>;
  getRevision(uid: string, homeId: string, revisionId: string): Promise<HomeRevision | undefined>;
  putSummary(uid: string, homeId: string, summary: HomeSummary): Promise<void>;
  getSummary(uid: string, homeId: string, summaryId: string, purpose?: "agreement"): Promise<HomeSummary | undefined>;
}

/** Content is immutable and written before the transaction publishing a head. */
export class FirestoreHomeDatabase implements HomeDatabase {
  constructor(private db: Firestore) {}
  private home(uid: string, id: string) { return this.db.collection("users").doc(uid).collection("homes").doc(id); }
  transaction<T>(operation: (transaction: HomeTransaction) => Promise<T>) {
    return this.db.runTransaction(transaction => operation({
      getHome: async (uid, id) => (await transaction.get(this.home(uid, id))).data() as StoredHome | undefined,
      putHome: home => { if (Buffer.byteLength(JSON.stringify(home)) > 850_000) throw new AppError(422, "HOME_STORAGE_LIMIT", "This project's saved history has reached its limit."); transaction.set(this.home(home.ownerId, home.id), home); },
      getOwner: async uid => ((await transaction.get(this.db.collection("homeOwners").doc(uid))).data() as HomeOwner | undefined) ?? emptyOwner(),
      putOwner: (uid, owner) => { transaction.set(this.db.collection("homeOwners").doc(uid), owner); },
      getProject: async (uid, id) => (await transaction.get(this.db.collection("users").doc(uid).collection("projects").doc(id))).data() as StoredProject | undefined,
      putProject: project => { transaction.set(this.db.collection("users").doc(project.ownerId).collection("projects").doc(project.id), project); },
    }));
  }
  async list(uid: string) {
    const result = await this.db.collection("users").doc(uid).collection("homes").orderBy("updatedAt", "desc").limit(HOME_LIMITS.homes).get();
    return result.docs.map(doc => doc.data() as StoredHome).filter(home => home.ownerId === uid);
  }
  async putRevision(uid: string, homeId: string, revision: HomeRevision) {
    const serialized = JSON.stringify(revision);
    if (Buffer.byteLength(serialized) > HOME_LIMITS.chunkBytes) throw new AppError(422, "SCENE_TOO_LARGE", "This layout exceeds the supported scene size.");
    const reference = this.home(uid, homeId).collection("revisions").doc(revision.id);
    const hash = homeHash({ ...revision, createdAt: "" });
    try { await reference.create({ content: serialized, hash }); }
    catch (error) {
      if (!(typeof error === "object" && error && "code" in error && [6, "already-exists"].includes(error.code as number | string))) throw error;
      const previous = (await reference.get()).data();
      if (previous?.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This request already saved different content. Start a new change.");
    }
  }
  async getRevision(uid: string, homeId: string, revisionId: string) {
    const data = (await this.home(uid, homeId).collection("revisions").doc(revisionId).get()).data();
    if (!data) return;
    const revision = JSON.parse(data.content as string) as HomeRevision;
    if (homeHash({ ...revision, createdAt: "" }) !== data.hash) throw new AppError(503, "SCENE_CORRUPT", "The saved layout could not be verified. Its history has been preserved.");
    return revision;
  }
  async putSummary(uid: string, homeId: string, summary: HomeSummary) {
    if (Buffer.byteLength(JSON.stringify(summary)) > 100_000) throw new AppError(422, "SUMMARY_TOO_LARGE", "The design summary is too long.");
    const reference = this.home(uid, homeId).collection(summary.purpose === "agreement" ? "agreementProse" : "summaries").doc(summary.id);
    try { await reference.create(summary); }
    catch (error) { if (!(typeof error === "object" && error && "code" in error && [6, "already-exists"].includes(error.code as number | string))) throw error; }
  }
  async getSummary(uid: string, homeId: string, summaryId: string, purpose?: "agreement") {
    return (await this.home(uid, homeId).collection(purpose === "agreement" ? "agreementProse" : "summaries").doc(summaryId).get()).data() as HomeSummary | undefined;
  }
}

export class HomeStore {
  constructor(readonly database: HomeDatabase, private now: () => number = Date.now) {}
  async create(uid: string, requestId: string): Promise<HomeProject> {
    const id = await this.database.transaction(async transaction => {
      const owner = await transaction.getOwner(uid);
      if (owner.creations[requestId]) return owner.creations[requestId]!;
      if (owner.homeIds.length >= HOME_LIMITS.homes) throw new AppError(422, "HOME_LIMIT", "Your workspace has reached its 20-home limit. Continue with a saved home.");
      const id = randomUUID(); const timestamp = new Date(this.now()).toISOString();
      const home: StoredHome = { id, ownerId: uid, title: "My home", createdAt: timestamp, updatedAt: timestamp, templateId: null, headRevisionId: null, brief: null, revisions: [], summary: null, proposalProjectId: null, receipts: {}, jobs: {}, callsUsed: 0 };
      owner.homeIds.push(id); owner.creations[requestId] = id;
      transaction.putHome(home); transaction.putOwner(uid, owner); return id;
    });
    return this.get(uid, id);
  }
  async stored(uid: string, id: string) {
    return this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid);
      const active = home.activeRequestId ? home.jobs[home.activeRequestId] : undefined;
      if (active?.status === "running" && active.expiresAt <= this.now()) {
        const owner = await transaction.getOwner(uid);
        active.status = "unknown"; active.phase = "done"; active.updatedAt = new Date(this.now()).toISOString();
        active.error = { code: "GENERATION_OUTCOME_UNKNOWN", message: "This request was interrupted. Check its saved result before deliberately starting a new request." };
        if (owner.active?.requestId === active.requestId && owner.active.homeId === id) { delete owner.active; transaction.putOwner(uid, owner); }
        transaction.putHome(home);
      }
      return home;
    });
  }
  private async project(home: StoredHome): Promise<HomeProject> {
    const { id, title, createdAt, updatedAt, templateId, headRevisionId, brief, revisions, summary, proposalProjectId, roomId } = home;
    const revision = headRevisionId ? await this.database.getRevision(home.ownerId, id, headRevisionId) : undefined;
    if (headRevisionId && !revision) throw new AppError(503, "SCENE_UNAVAILABLE", "The saved layout could not be loaded. Retry without creating a new project.");
    const job = home.activeRequestId ? home.jobs[home.activeRequestId] : undefined;
    return { id, title, createdAt, updatedAt, templateId, headRevisionId, brief, revisions, summary, proposalProjectId, ...(roomId ? { roomId } : {}), scene: revision?.scene ?? null, activeJob: job ? publicHomeJob(job) : null };
  }
  async get(uid: string, id: string) { return this.project(await this.stored(uid, id)); }
  async list(uid: string) { return Promise.all((await this.database.list(uid)).map(home => this.project(home))); }
  async revision(uid: string, id: string, revisionId: string) {
    const home = await this.stored(uid, id);
    if (!home.revisions.some(revision => revision.id === revisionId)) throw new AppError(404, "REVISION_NOT_FOUND", "This saved version could not be found.");
    const revision = await this.database.getRevision(uid, id, revisionId);
    if (!revision) throw new AppError(503, "SCENE_UNAVAILABLE", "This saved version could not be loaded. Try again shortly.");
    return { ...revision, conflict: home.revisions.find(item => item.id === revisionId)!.conflict };
  }
  async receipt(uid: string, id: string, requestId: string, kind: string, hash: string) {
    const receipt = (await this.stored(uid, id)).receipts[requestId];
    if (receipt && (receipt.kind !== kind || receipt.hash !== hash)) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values. Start a new change.");
    return receipt;
  }
  async publish(uid: string, id: string, input: { requestId: string; hash: string; kind: string; baseRevisionId: string | null; revision: HomeRevision; templateId?: string }) {
    const previous = await this.receipt(uid, id, input.requestId, input.kind, input.hash);
    if (previous?.revisionId) return this.get(uid, id);
    await this.database.putRevision(uid, id, input.revision);
    await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid);
      const receipt = home.receipts[input.requestId];
      if (receipt) { if (receipt.hash !== input.hash || receipt.kind !== input.kind) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values."); return; }
      if (home.revisions.length >= HOME_LIMITS.revisions || Object.keys(home.receipts).length >= HOME_LIMITS.requests) throw new AppError(422, "HOME_HISTORY_LIMIT", "This home has reached its saved-history limit.");
      const conflict = home.headRevisionId !== input.baseRevisionId;
      home.revisions.push({ ...revisionSummary(input.revision), conflict });
      home.receipts[input.requestId] = { hash: input.hash, kind: input.kind, revisionId: input.revision.id };
      if (!conflict) {
        home.headRevisionId = input.revision.id; home.title = input.revision.title; home.brief = input.revision.brief;
        home.summary = null; home.proposalProjectId = null;
        if (input.templateId) home.templateId = input.templateId;
      }
      home.updatedAt = new Date(this.now()).toISOString(); transaction.putHome(home);
    });
    return this.get(uid, id);
  }
  async beginJob(uid: string, id: string, input: { requestId: string; hash: string; kind: "generate" | "summary" | "agreement"; baseRevisionId: string }) {
    await this.stored(uid, id);
    return this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid);
      const owner = await transaction.getOwner(uid);
      const receipt = home.receipts[input.requestId];
      if (receipt) {
        if (receipt.kind !== input.kind || receipt.hash !== input.hash) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values.");
        return { dispatch: false, job: publicHomeJob(home.jobs[input.requestId]!) };
      }
      if (home.headRevisionId !== input.baseRevisionId) throw new AppError(409, "HOME_CHANGED", "This home has a newer saved version. Reload before generating.");
      if (home.activeRequestId && home.jobs[home.activeRequestId]?.status === "save_pending") throw new AppError(409, "HOME_SAVE_PENDING", "Finish saving the generated design before starting another request.");
      if (owner.active && owner.active.expiresAt > this.now()) throw new AppError(409, "HOME_JOB_RUNNING", "A design request is already running in your workspace.");
      if (home.callsUsed >= HOME_LIMITS.homeCalls || owner.callsUsed >= HOME_LIMITS.ownerCalls) throw new AppError(429, "HOME_AI_LIMIT", "This workspace has reached its AI allowance. Saved designs and manual edits remain available.");
      if (Object.keys(home.receipts).length >= HOME_LIMITS.requests || home.revisions.length >= HOME_LIMITS.revisions) throw new AppError(422, "HOME_HISTORY_LIMIT", "This home has reached its saved-history limit.");
      const timestamp = new Date(this.now()).toISOString(); const expiresAt = this.now() + HOME_LIMITS.leaseMs;
      const job = { requestId: input.requestId, kind: input.kind, status: "running" as const, baseRevisionId: input.baseRevisionId, phase: "planning" as const, attemptsUsed: 0, startedAt: timestamp, updatedAt: timestamp, expiresAt };
      home.jobs[input.requestId] = job; home.activeRequestId = input.requestId;
      home.receipts[input.requestId] = { hash: input.hash, kind: input.kind };
      owner.active = { homeId: id, requestId: input.requestId, expiresAt };
      transaction.putHome(home); transaction.putOwner(uid, owner);
      return { dispatch: true, job: publicHomeJob(job) };
    });
  }
  async cachedProse(uid: string, id: string, input: { requestId: string; hash: string; kind: "summary" | "agreement"; baseRevisionId: string }) {
    return this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid);
      const receipt = home.receipts[input.requestId];
      if (receipt) {
        if (receipt.kind !== input.kind || receipt.hash !== input.hash) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values.");
        return null;
      }
      if (home.headRevisionId !== input.baseRevisionId) return null;
      const previous = Object.values(home.jobs).find(job => job.kind === input.kind && job.baseRevisionId === input.baseRevisionId && job.status === "complete" && job.resultSummaryId);
      if (!previous) return null;
      if (Object.keys(home.receipts).length >= HOME_LIMITS.requests) throw new AppError(422, "HOME_HISTORY_LIMIT", "This home has reached its saved-history limit.");
      const timestamp = new Date(this.now()).toISOString();
      const job = { ...previous, requestId: input.requestId, attemptsUsed: 0, expiresAt: 0, startedAt: timestamp, updatedAt: timestamp };
      home.jobs[input.requestId] = job; home.receipts[input.requestId] = { hash: input.hash, kind: input.kind }; transaction.putHome(home);
      return publicHomeJob(job);
    });
  }
  async reserveAttempt(uid: string, id: string, requestId: string, model: string) {
    return this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const owner = await transaction.getOwner(uid);
      const job = home.jobs[requestId];
      if (!job || job.status !== "running" || job.expiresAt <= this.now() || owner.active?.requestId !== requestId || owner.active.homeId !== id) return false;
      if (home.headRevisionId !== job.baseRevisionId) {
        job.status = "conflict"; job.phase = "done"; job.error = { code: "HOME_CHANGED", message: "A newer design was saved before this model attempt began. Reload before generating again." };
        delete owner.active; transaction.putHome(home); transaction.putOwner(uid, owner); return false;
      }
      if (job.attemptsUsed >= 2 || home.callsUsed >= HOME_LIMITS.homeCalls || owner.callsUsed >= HOME_LIMITS.ownerCalls) throw new AppError(429, "HOME_AI_LIMIT", "The AI attempt allowance has been reached. Your saved layout is unchanged.");
      job.attemptsUsed++; job.model = model; job.updatedAt = new Date(this.now()).toISOString(); home.callsUsed++; owner.callsUsed++;
      transaction.putHome(home); transaction.putOwner(uid, owner); return true;
    });
  }
  async phase(uid: string, id: string, requestId: string, phase: HomeJob["phase"]) {
    await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const job = home.jobs[requestId];
      if (job?.status === "running") { job.phase = phase; job.updatedAt = new Date(this.now()).toISOString(); transaction.putHome(home); }
    });
  }
  async stage(uid: string, id: string, requestId: string, result: { revision: HomeRevision } | { summary: HomeSummary }) {
    if ("revision" in result) await this.database.putRevision(uid, id, result.revision);
    else {
      await this.database.putSummary(uid, id, result.summary);
      const saved = await this.database.getSummary(uid, id, result.summary.id, result.summary.purpose);
      if (!saved) throw new AppError(503, "HOME_SAVE_PENDING", "The generated summary is waiting to finish saving.");
      result = { summary: saved };
    }
    await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const job = home.jobs[requestId];
      if (!job || !["running", "unknown"].includes(job.status) || home.activeRequestId !== requestId) return;
      job.status = "save_pending"; job.phase = "saving"; job.updatedAt = new Date(this.now()).toISOString();
      if ("revision" in result) job.stagedRevisionId = result.revision.id; else job.stagedSummary = result.summary;
      transaction.putHome(home);
    });
  }
  async complete(uid: string, id: string, requestId: string) {
    const state = await this.stored(uid, id); const pending = state.jobs[requestId];
    const revision = pending?.stagedRevisionId ? await this.database.getRevision(uid, id, pending.stagedRevisionId) : undefined;
    await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const owner = await transaction.getOwner(uid); const job = home.jobs[requestId];
      if (!job || job.status !== "save_pending") return;
      if (!revision && !job.stagedSummary) throw new AppError(503, "HOME_SAVE_PENDING", "The generated result is waiting to finish saving. Retry this request without another AI call.");
      const conflict = home.headRevisionId !== job.baseRevisionId;
      if (revision) {
        home.revisions.push({ ...revisionSummary(revision), conflict }); job.resultRevisionId = revision.id;
        home.receipts[requestId]!.revisionId = revision.id;
        if (!conflict) { home.headRevisionId = revision.id; home.title = revision.title; home.brief = revision.brief; home.summary = null; home.proposalProjectId = null; }
      } else if (!conflict) {
        job.resultSummaryId = job.stagedSummary!.id;
        if (job.kind === "summary") home.summary = job.stagedSummary!;
      }
      job.status = conflict ? "conflict" : "complete"; job.phase = "done"; job.updatedAt = new Date(this.now()).toISOString();
      if (conflict) job.error = { code: "HOME_CHANGED", message: "A newer design was saved while this request ran. Both versions remain in history; choose which to continue." };
      delete job.stagedRevisionId; delete job.stagedSummary;
      if (owner.active?.requestId === requestId && owner.active.homeId === id) { delete owner.active; transaction.putOwner(uid, owner); }
      home.updatedAt = job.updatedAt; transaction.putHome(home);
    });
    return this.get(uid, id);
  }
  async fail(uid: string, id: string, requestId: string, status: "failed" | "unknown" | "cancelled", error?: { code: string; message: string }) {
    await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const owner = await transaction.getOwner(uid); const job = home.jobs[requestId];
      if (!job) throw new AppError(404, "HOME_JOB_NOT_FOUND", "This design request could not be found.");
      if (!["running", "unknown", ...(status === "cancelled" ? ["save_pending"] : [])].includes(job.status)) return;
      job.status = status; job.phase = "done"; job.updatedAt = new Date(this.now()).toISOString(); if (error) job.error = error;
      if (status === "cancelled") { delete job.stagedRevisionId; delete job.stagedSummary; }
      if (owner.active?.requestId === requestId && owner.active.homeId === id) { delete owner.active; transaction.putOwner(uid, owner); }
      transaction.putHome(home);
    });
    return this.get(uid, id);
  }
  async job(uid: string, id: string, requestId: string) {
    const home = await this.stored(uid, id); const job = home.jobs[requestId];
    if (!job) throw new AppError(404, "HOME_JOB_NOT_FOUND", "This design request could not be found.");
    return publicHomeJob(job);
  }
  async resume(uid: string, id: string, requestId: string) {
    const job = await this.job(uid, id, requestId);
    if (!["save_pending", "complete"].includes(job.status)) throw new AppError(409, "HOME_SAVE_NOT_READY", "This request has no completed design waiting to save. Check its status before starting a new request.");
    return this.complete(uid, id, requestId);
  }
  async summary(uid: string, id: string, revisionId: string, purpose?: "agreement") {
    await this.revision(uid, id, revisionId);
    const home = await this.stored(uid, id);
    const published = Object.values(home.jobs).findLast(job => job.kind === (purpose === "agreement" ? "agreement" : "summary") && job.baseRevisionId === revisionId && job.status === "complete" && job.resultSummaryId);
    if (!published?.resultSummaryId) throw new AppError(409, "SUMMARY_REQUIRED", "Finish saving a summary for this version before exporting.");
    const summary = await this.database.getSummary(uid, id, published.resultSummaryId, purpose);
    if (!summary) throw new AppError(409, "SUMMARY_REQUIRED", "Prepare a design summary for this saved version before exporting.");
    return summary;
  }
  async linkProposal(uid: string, id: string, input: { requestId: string; baseRevisionId: string; hash: string; project: StoredProject }) {
    const projectId = await this.database.transaction(async transaction => {
      const home = ownerOf(await transaction.getHome(uid, id), uid); const receipt = home.receipts[input.requestId];
      if (receipt) { if (receipt.hash !== input.hash || receipt.kind !== "proposal") throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values."); return receipt.projectId!; }
      if (home.headRevisionId !== input.baseRevisionId) throw new AppError(409, "HOME_CHANGED", "This home has a newer saved version. Reload before preparing a proposal.");
      if (Object.keys(home.receipts).length >= HOME_LIMITS.requests) throw new AppError(422, "HOME_HISTORY_LIMIT", "This home has reached its saved-history limit.");
      home.receipts[input.requestId] = { hash: input.hash, kind: "proposal", projectId: input.project.id }; home.proposalProjectId = input.project.id;
      transaction.putProject(input.project); transaction.putHome(home); return input.project.id;
    });
    return projectId;
  }
}
