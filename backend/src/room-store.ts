import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AppError } from "./errors.js";
import { assertOwner } from "./store.js";
import type { Analysis, StoredProject } from "./types.js";
import {
  assertInvite, assertJoinCodeHash, checkedSharedDraft, currentSnapshot, frozenProject, joinCodeHash, memberRole, newInvite, newRoom,
  publicRoom, requireDesigner, ROOM_CALL_LIMIT, ROOM_DEBOUNCE_MS, ROOM_LEASE_MS, ROOM_MESSAGE_LIMIT,
  ROOM_OWNER_LIMIT, ROOM_TRANSCRIPT_LIMIT, roomNotFound, roomTranscript
} from "./room-domain.js";
import type { ObserverRun, RoomOwner, StoredRoom } from "./room-types.js";

/** All dependent reads occur before writes; the Firestore adapter commits them atomically. */
export interface RoomTransaction {
  getRoom(id: string): Promise<StoredRoom | undefined>;
  putRoom(room: StoredRoom): void;
  getOwner(uid: string): Promise<RoomOwner>;
  putOwner(uid: string, owner: RoomOwner): void;
  getProject(uid: string, id: string): Promise<StoredProject | undefined>;
  putProject(project: StoredProject): void;
}
export interface RoomDatabase {
  transaction<T>(operation: (transaction: RoomTransaction) => Promise<T>): Promise<T>;
  scheduledIds(): Promise<string[]>;
  findRoomByJoinCodeHash(hash: string): Promise<string | undefined>;
}
export class FirestoreRoomDatabase implements RoomDatabase {
  constructor(private db: Firestore) {}
  private room(id: string) { return this.db.collection("rooms").doc(id); }
  private owner(uid: string) { return this.db.collection("roomOwners").doc(uid); }
  private project(uid: string, id: string) { return this.db.collection("users").doc(uid).collection("projects").doc(id); }
  transaction<T>(operation: (transaction: RoomTransaction) => Promise<T>) {
    return this.db.runTransaction(transaction => operation({
      getRoom: async id => (await transaction.get(this.room(id))).data() as StoredRoom | undefined,
      putRoom: room => { transaction.set(this.room(room.id), room); },
      getOwner: async uid => ((await transaction.get(this.owner(uid))).data() as RoomOwner | undefined) ?? { projects: {} },
      putOwner: (uid, owner) => { transaction.set(this.owner(uid), owner); },
      getProject: async (uid, id) => (await transaction.get(this.project(uid, id))).data() as StoredProject | undefined,
      putProject: project => { transaction.set(this.project(project.ownerId, project.id), project); }
    }));
  }
  async scheduledIds() {
    const snapshot = await this.db.collection("rooms").where("observer.status", "in", ["queued", "thinking"]).get();
    return snapshot.docs.map(document => document.id);
  }
  async findRoomByJoinCodeHash(hash: string) {
    const snapshot = await this.db.collection("rooms").where("invite.codeHash", "==", hash).limit(2).get();
    return snapshot.docs.length === 1 ? snapshot.docs[0]!.id : undefined;
  }
}

export type ClaimedReview = { room: StoredRoom; run: ObserverRun };
export class RoomStore {
  constructor(private database: RoomDatabase, readonly provider: Analysis["provider"], private clock: () => number = Date.now) {}

  async create(uid: string, projectId: string) {
    const now = this.clock();
    const invitation = newInvite(now);
    const room = await this.database.transaction(async transaction => {
      const project = await transaction.getProject(uid, projectId);
      assertOwner(project, uid);
      const owner = await transaction.getOwner(uid);
      const existingId = owner.projects[projectId];
      if (existingId) {
        const existing = await transaction.getRoom(existingId);
        requireDesigner(existing, uid);
        existing.invite = invitation.stored;
        existing.updatedAt = new Date(now).toISOString();
        transaction.putRoom(existing);
        return existing;
      }
      if (Object.keys(owner.projects).length >= ROOM_OWNER_LIMIT) throw new AppError(422, "ROOM_LIMIT", "This workspace has reached its 10-room limit. Continue in an existing room.");
      const created = newRoom(project, this.provider, invitation.stored, now);
      owner.projects[projectId] = created.id;
      transaction.putRoom(created);
      transaction.putOwner(uid, owner);
      return created;
    });
    return { room: publicRoom(room, uid), inviteToken: invitation.token, joinCode: invitation.joinCode };
  }

  async get(uid: string, id: string) {
    return this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      const role = memberRole(room, uid);
      const project = role === "designer" && room!.draftProjectId ? await transaction.getProject(uid, room!.draftProjectId) : undefined;
      return publicRoom(room!, uid, role === "designer" ? checkedSharedDraft(room!, project, this.clock()) : undefined);
    });
  }

  async invite(uid: string, id: string) {
    const now = this.clock();
    const invitation = newInvite(now);
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      requireDesigner(room, uid);
      room.invite = invitation.stored;
      room.updatedAt = new Date(now).toISOString();
      transaction.putRoom(room);
    });
    return { inviteToken: invitation.token, joinCode: invitation.joinCode };
  }

  async joinCode(uid: string, code: string) {
    const hash = joinCodeHash(code);
    const id = await this.database.findRoomByJoinCodeHash(hash);
    if (!id) throw new AppError(403, "INVITE_INVALID", "This room code is invalid or has expired. Ask the designer for a new invitation.");
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      if (!room) throw new AppError(403, "INVITE_INVALID", "This room code is invalid or has expired. Ask the designer for a new invitation.");
      // The query is only a lookup. Rotation/expiry and membership are checked
      // again inside the binding transaction, so a lookup cannot authorize a join.
      assertJoinCodeHash(room, hash, this.clock());
      this.bindClient(room, uid);
      transaction.putRoom(room);
    });
    return this.get(uid, id);
  }

  private bindClient(room: StoredRoom, uid: string) {
    if (room.ownerId === uid) throw new AppError(403, "CLIENT_IDENTITY_REQUIRED", "Open this invitation using the separate client view, with a client identity.");
    if (room.clientId && room.clientId !== uid) throw new AppError(403, "ROOM_FULL", "This room already has its invited client.");
    if (room.clientId === uid) return;
    room.clientId = uid;
    room.updatedAt = new Date(this.clock()).toISOString();
  }

  async join(uid: string, id: string, token: string) {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      if (!room) throw roomNotFound();
      assertInvite(room, token, this.clock());
      this.bindClient(room, uid);
      transaction.putRoom(room);
    });
    return this.get(uid, id);
  }

  async message(uid: string, id: string, input: { text: string; requestId: string }) {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      const role = memberRole(room, uid);
      const previous = room!.messages.find(message => message.requestId === input.requestId);
      if (previous) {
        if (previous.senderId !== uid || previous.text !== input.text) throw new AppError(409, "REQUEST_REUSED", "This message request was already used with different values. Send a new message instead.");
        return;
      }
      if (room!.messages.length >= ROOM_MESSAGE_LIMIT) throw new AppError(422, "MESSAGE_LIMIT", "This room has reached its 40-message limit. Its conversation and shared drafts remain available.");
      const now = this.clock();
      room!.messages.push({ id: randomUUID(), requestId: input.requestId, senderId: uid, role, text: input.text, createdAt: new Date(now).toISOString() });
      if (roomTranscript(room!).length > ROOM_TRANSCRIPT_LIMIT) throw new AppError(422, "TRANSCRIPT_LIMIT", "This room's conversation has reached its text limit. Use a shorter message.");
      room!.updatedAt = new Date(now).toISOString();
      room!.nextRunAt = now + ROOM_DEBOUNCE_MS;
      // An error requires an explicit retry; a new message never silently retries a failed paid call.
      if (!room!.paused && room!.observer.status !== "error") {
        room!.observer.status = room!.run ? "thinking" : room!.observer.callsUsed >= ROOM_CALL_LIMIT ? "limit" : "queued";
      }
      transaction.putRoom(room!);
    });
    return this.get(uid, id);
  }

  async control(uid: string, id: string, action: "retry" | "pause" | "resume") {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      requireDesigner(room, uid);
      const now = this.clock();
      if (action === "pause") {
        room.paused = true;
        room.observer.status = "paused";
      } else {
        if (action === "retry" && room.observer.status !== "error") throw new AppError(409, "RETRY_NOT_NEEDED", "Retry is available when a review has failed.");
        if (action === "resume" && !room.paused) return;
        room.paused = false;
        // Pausing a failed review must not turn resume into an implicit retry.
        if (action === "resume" && room.observer.error) room.observer.status = "error";
        else if (room.run) room.observer.status = "thinking";
        else if (room.observer.analysis && room.observer.reviewedMessageCount === room.messages.length) room.observer.status = "ready";
        else if (!room.messages.length) room.observer.status = "watching";
        else room.observer.status = room.observer.callsUsed >= ROOM_CALL_LIMIT ? "limit" : "queued";
        if (action === "retry") delete room.observer.error;
        room.nextRunAt = now;
      }
      room.updatedAt = new Date(now).toISOString();
      transaction.putRoom(room);
    });
    return this.get(uid, id);
  }

  async prepare(uid: string, id: string) {
    return this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      requireDesigner(room, uid);
      const snapshot = currentSnapshot(room);
      const existing = await transaction.getProject(uid, snapshot.projectId);
      if (existing && (existing.ownerId !== uid || existing.roomId !== room.id)) throw roomNotFound();
      const project = existing ?? frozenProject(room, snapshot);
      if (!existing) transaction.putProject(project);
      room.draftProjectId = project.id;
      room.updatedAt = new Date(this.clock()).toISOString();
      transaction.putRoom(room);
      return project;
    });
  }

  async share(uid: string, id: string) {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      requireDesigner(room, uid);
      const project = room.draftProjectId ? await transaction.getProject(uid, room.draftProjectId) : undefined;
      const draft = checkedSharedDraft(room, project, this.clock());
      if (!draft) throw new AppError(409, "DRAFT_REQUIRED", "Prepare and save a draft from this room before sharing it.");
      if (room.sharedDrafts.some(item => item.id === draft.id)) return;
      if (room.sharedDrafts.length >= 100) throw new AppError(422, "SHARE_LIMIT", "This room has reached its 100-shared-draft limit. Earlier drafts remain available.");
      room.sharedDrafts.push(draft);
      room.updatedAt = draft.sharedAt;
      transaction.putRoom(room);
    });
    return this.get(uid, id);
  }

  scheduledIds() { return this.database.scheduledIds(); }

  /** The persisted room lease and owner lease prevent duplicate workers and tabs from spending twice. */
  async claim(id: string): Promise<ClaimedReview | undefined> {
    return this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      if (!room) return;
      const now = this.clock();
      if (room.run) {
        if (room.run.leaseUntil > now) return;
        const owner = await transaction.getOwner(room.ownerId);
        if (owner.active?.runId === room.run.id) { delete owner.active; transaction.putOwner(room.ownerId, owner); }
        delete room.run;
        room.observer.status = room.paused ? "paused" : "error";
        room.observer.error = "The review was interrupted. Your conversation is saved. Retry when you are ready.";
        room.observer.updatedAt = new Date(now).toISOString();
        transaction.putRoom(room);
        return;
      }
      if (room.paused || room.observer.status !== "queued" || room.nextRunAt > now) return;
      if (room.observer.provider !== this.provider) {
        room.observer.status = "error";
        room.observer.error = "The workspace's AI mode has changed. Restore this room's original mode or start a new room in the current mode.";
        transaction.putRoom(room);
        return;
      }
      if (room.observer.callsUsed >= ROOM_CALL_LIMIT) {
        room.observer.status = "limit";
        transaction.putRoom(room);
        return;
      }
      const owner = await transaction.getOwner(room.ownerId);
      if (owner.active && owner.active.leaseUntil > now) return;
      const run = { id: randomUUID(), messageCount: room.messages.length, leaseUntil: now + ROOM_LEASE_MS };
      room.run = run;
      room.observer.status = "thinking";
      room.observer.callsUsed += 1;
      room.observer.updatedAt = new Date(now).toISOString();
      delete room.observer.error;
      owner.active = { roomId: room.id, runId: run.id, leaseUntil: run.leaseUntil };
      transaction.putOwner(room.ownerId, owner);
      transaction.putRoom(room);
      return { room, run };
    });
  }

  async finish(id: string, runId: string, result: { analysis: Analysis } | { error: string }) {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(id);
      if (!room?.run || room.run.id !== runId) return;
      const owner = await transaction.getOwner(room.ownerId);
      const count = room.run.messageCount;
      const now = this.clock();
      delete room.run;
      if (owner.active?.runId === runId) { delete owner.active; transaction.putOwner(room.ownerId, owner); }
      if ("error" in result) {
        room.observer.status = room.paused ? "paused" : "error";
        room.observer.error = result.error;
      } else {
        room.snapshots.push({ messageCount: count, analysis: result.analysis, createdAt: new Date(now).toISOString(), projectId: randomUUID() });
        if (room.paused) room.observer.status = "paused";
        else if (room.messages.length === count) {
          room.observer.status = "ready";
          room.observer.analysis = result.analysis;
          room.observer.reviewedMessageCount = count;
        } else room.observer.status = room.observer.callsUsed >= ROOM_CALL_LIMIT ? "limit" : "queued";
        delete room.observer.error;
      }
      room.observer.updatedAt = new Date(now).toISOString();
      room.updatedAt = new Date(now).toISOString();
      transaction.putRoom(room);
    });
  }
}
