import { homeHash, type HomeDatabase, type HomeTransaction } from "../src/home-store.js";
import type { HomeOwner, HomeRevision, HomeSummary, StoredHome } from "../src/home-types.js";
import type { HomeCollaborationDatabase, HomeCollaborationTransaction, AssistantIndex } from "../src/home-collaboration.js";
import type { StoredHomeRoom } from "../src/home-collaboration-types.js";
import { AppError } from "../src/errors.js";
import type { StoredProject } from "../src/types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

/** Shared mutex models atomic head/approval transactions across both adapters. */
class MemoryTransactions {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>) { const result = this.tail.then(operation, operation); this.tail = result.catch(() => {}); return result; }
}
export class MemoryHomeDatabase implements HomeDatabase {
  readonly mutex = new MemoryTransactions();
  homes = new Map<string, StoredHome>(); owners = new Map<string, HomeOwner>(); revisions = new Map<string, HomeRevision>(); summaries = new Map<string, HomeSummary>();
  failRevisionWrites = 0;
  constructor(readonly projects: MemoryProjectStore) {}
  transaction<T>(operation: (transaction: HomeTransaction) => Promise<T>) {
    return this.mutex.run(async () => {
      const homes = new Map<string, StoredHome>(); const owners = new Map<string, HomeOwner>(); const projects = new Map<string, StoredProject>();
      const result = await operation({
        getHome: async (uid, id) => { const home = this.homes.get(id); return home?.ownerId === uid ? structuredClone(home) : undefined; },
        putHome: home => { homes.set(home.id, structuredClone(home)); },
        getOwner: async uid => structuredClone(this.owners.get(uid) ?? { homeIds: [], creations: {}, callsUsed: 0 }),
        putOwner: (uid, owner) => { owners.set(uid, structuredClone(owner)); },
        getProject: async (uid, id) => { const project = this.projects.projects.get(id); return project?.ownerId === uid ? structuredClone(project) : undefined; },
        putProject: project => { projects.set(project.id, structuredClone(project)); },
      });
      for (const [id, home] of homes) this.homes.set(id, home); for (const [uid, owner] of owners) this.owners.set(uid, owner); for (const [id, project] of projects) this.projects.projects.set(id, project);
      return structuredClone(result);
    });
  }
  async list(uid: string) { return structuredClone([...this.homes.values()].filter(home => home.ownerId === uid)); }
  async putRevision(uid: string, id: string, revision: HomeRevision) {
    if (this.failRevisionWrites > 0) { this.failRevisionWrites--; throw new Error("private storage error"); }
    const key = `${uid}/${id}/${revision.id}`; const previous = this.revisions.get(key);
    if (previous && homeHash({ ...previous, createdAt: "" }) !== homeHash({ ...revision, createdAt: "" })) throw new AppError(409, "REQUEST_REUSED", "Different saved content.");
    if (!previous) this.revisions.set(key, structuredClone(revision));
  }
  async getRevision(uid: string, id: string, revisionId: string) { return structuredClone(this.revisions.get(`${uid}/${id}/${revisionId}`)); }
  async putSummary(uid: string, id: string, summary: HomeSummary) { const key = `${uid}/${id}/${summary.purpose ?? "design"}/${summary.id}`; if (!this.summaries.has(key)) this.summaries.set(key, structuredClone(summary)); }
  async getSummary(uid: string, id: string, summaryId: string, purpose?: "agreement") { return structuredClone(this.summaries.get(`${uid}/${id}/${purpose ?? "design"}/${summaryId}`)); }
}
export class MemoryHomeCollaborationDatabase implements HomeCollaborationDatabase {
  links = new Map<string, StoredHomeRoom>(); indices = new Map<string, Record<string, string>>(); assistants = new Map<string, AssistantIndex>();
  constructor(readonly homes: MemoryHomeDatabase, readonly rooms: MemoryRoomDatabase) {}
  transaction<T>(operation: (transaction: HomeCollaborationTransaction) => Promise<T>) {
    return this.homes.mutex.run(async () => {
      const links = new Map<string, StoredHomeRoom>(); const indices = new Map<string, Record<string, string>>(); const assistants = new Map<string, AssistantIndex>(); const homes = new Map<string, StoredHome>();
      const result = await operation({
        getRoom: async id => structuredClone(this.rooms.rooms.get(id)), getLink: async id => structuredClone(this.links.get(id)), putLink: link => { links.set(link.roomId, structuredClone(link)); },
        getHome: async (uid, id) => { const home = this.homes.homes.get(id); return home?.ownerId === uid ? structuredClone(home) : undefined; },
        putHome: home => { homes.set(home.id, structuredClone(home)); },
        getIndex: async uid => structuredClone(this.indices.get(uid) ?? {}), putIndex: (uid, index) => { indices.set(uid, structuredClone(index)); },
        getAssistants: async uid => structuredClone(this.assistants.get(uid) ?? { profiles: {}, receipts: {} }), putAssistants: (uid, index) => { assistants.set(uid, structuredClone(index)); },
      });
      for (const [id, link] of links) this.links.set(id, link); for (const [uid, index] of indices) this.indices.set(uid, index); for (const [uid, index] of assistants) this.assistants.set(uid, index);
      for (const [id, home] of homes) this.homes.homes.set(id, home);
      return structuredClone(result);
    });
  }
}
