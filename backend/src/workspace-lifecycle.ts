import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { Express } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";
import { HOME_LIMITS, homeHash } from "./home-store.js";
import { activeRoomProjectCount, roomOwnerLimit } from "./room-store.js";
import type { HomeOwner, StoredHome } from "./home-types.js";
import type { RoomOwner, StoredRoom } from "./room-types.js";
import { ROOM_OUTBOX_COLLECTION, type RoomDelivery } from "./room-outbox.js";
import type { TrashItem, RestoredItem, LifecycleReceipt } from "./workspace-lifecycle-types.js";
export type { TrashItem, RestoredItem, LifecycleReceipt } from "./workspace-lifecycle-types.js";

export interface LifecycleTransaction {
  getHome(uid: string, id: string): Promise<StoredHome | undefined>;
  putHome(home: StoredHome): void;
  getRoom(id: string): Promise<StoredRoom | undefined>;
  putRoom(room: StoredRoom): void;
  getHomeOwner(uid: string): Promise<HomeOwner>;
  putHomeOwner(uid: string, owner: HomeOwner): void;
  getRoomOwner(uid: string): Promise<RoomOwner>;
  putRoomOwner(uid: string, owner: RoomOwner): void;
  getDelivery(id: string): Promise<RoomDelivery | undefined>;
  putDelivery(delivery: RoomDelivery): void;
  getReceipt(uid: string, requestId: string): Promise<LifecycleReceipt | undefined>;
  putReceipt(uid: string, requestId: string, receipt: LifecycleReceipt): void;
}
export interface LifecycleDatabase {
  transaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T>;
  list(uid: string): Promise<TrashItem[]>;
}
export class FirestoreLifecycleDatabase implements LifecycleDatabase {
  constructor(private db: Firestore) {}
  transaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>) {
    const home = (uid: string, id: string) => this.db.doc(`users/${uid}/homes/${id}`);
    const receipt = (uid: string, id: string) => this.db.doc(`users/${uid}/workspaceRequests/${id}`);
    return this.db.runTransaction(transaction => operation({
      getHome: async (uid, id) => (await transaction.get(home(uid, id))).data() as StoredHome | undefined,
      putHome: value => { transaction.set(home(value.ownerId, value.id), value); },
      getRoom: async id => (await transaction.get(this.db.doc(`rooms/${id}`))).data() as StoredRoom | undefined,
      putRoom: value => { transaction.set(this.db.doc(`rooms/${value.id}`), value); },
      getHomeOwner: async uid => (await transaction.get(this.db.doc(`homeOwners/${uid}`))).data() as HomeOwner ?? { homeIds: [], creations: {}, callsUsed: 0 },
      putHomeOwner: (uid, value) => { transaction.set(this.db.doc(`homeOwners/${uid}`), value); },
      getRoomOwner: async uid => (await transaction.get(this.db.doc(`roomOwners/${uid}`))).data() as RoomOwner ?? { projects: {} },
      putRoomOwner: (uid, value) => { transaction.set(this.db.doc(`roomOwners/${uid}`), value); },
      getDelivery: async id => (await transaction.get(this.db.doc(`${ROOM_OUTBOX_COLLECTION}/${id}`))).data() as RoomDelivery | undefined,
      putDelivery: value => { transaction.set(this.db.doc(`${ROOM_OUTBOX_COLLECTION}/${value.id}`), value); },
      getReceipt: async (uid, id) => (await transaction.get(receipt(uid, id))).data() as LifecycleReceipt | undefined,
      putReceipt: (uid, id, value) => { transaction.set(receipt(uid, id), value); },
    }));
  }
  async list(uid: string) {
    const [homes, rooms] = await Promise.all([
      this.db.collection(`users/${uid}/homes`).get(),
      this.db.collection("rooms").where("ownerId", "==", uid).get(),
    ]);
    return [...homes.docs, ...rooms.docs].flatMap(document => {
      const record = document.data() as StoredHome | StoredRoom;
      return record.ownerId === uid && record.trash && (record.trash.kind !== "home" || "headRevisionId" in record) ? [record.trash] : [];
    }).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }
}
const missing = () => new AppError(404, "WORKSPACE_ITEM_NOT_FOUND", "This saved home or shared room could not be found.");
const changed = () => new AppError(409, "TRASH_CHANGED", "This item's deletion status has changed. Refresh your workspace before trying again.");
export class WorkspaceLifecycle {
  constructor(readonly database: LifecycleDatabase, private now: () => number = Date.now) {}
  list(uid: string) { return this.database.list(uid); }
  private async target(transaction: LifecycleTransaction, uid: string, kind: "home" | "room", id: string) {
    let home: StoredHome | undefined; let room: StoredRoom | undefined;
    if (kind === "home") {
      home = await transaction.getHome(uid, id);
      if (!home || home.ownerId !== uid) throw missing();
      if (home.roomId) {
        room = await transaction.getRoom(home.roomId);
        if (!room || room.ownerId !== uid || room.homeId !== home.id) throw changed();
      }
    } else {
      room = await transaction.getRoom(id);
      if (!room || room.ownerId !== uid) throw missing();
      if (room.homeId) {
        home = await transaction.getHome(uid, room.homeId);
        if (!home || home.ownerId !== uid || home.roomId !== room.id) throw changed();
      }
    }
    return { home, room };
  }
  private async replay(transaction: LifecycleTransaction, uid: string, requestId: string, hash: string) {
    const receipt = await transaction.getReceipt(uid, requestId);
    if (receipt && receipt.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values. Refresh before trying again.");
    return receipt?.result;
  }
  async trash(uid: string, kind: "home" | "room", id: string, input: { requestId: string; baseRevisionId?: string | null }): Promise<TrashItem> {
    const hash = homeHash({ action: "trash", kind, id, ...input });
    return this.database.transaction(async transaction => {
      const previous = await this.replay(transaction, uid, input.requestId, hash);
      if (previous) return previous as TrashItem;
      const { home, room } = await this.target(transaction, uid, kind, id);
      const existing = home?.trash ?? room?.trash;
      if (existing) {
        transaction.putReceipt(uid, input.requestId, { hash, result: existing }); return existing;
      }
      if (kind === "home" && home!.headRevisionId !== input.baseRevisionId) throw new AppError(409, "HOME_CHANGED", "This home has a newer saved version. Review it before deleting.");
      const homeOwner = home ? await transaction.getHomeOwner(uid) : undefined;
      const roomOwner = room ? await transaction.getRoomOwner(uid) : undefined;
      const delivery = room?.delivery ? await transaction.getDelivery(room.delivery.id) : undefined;
      const timestamp = new Date(this.now()).toISOString();
      const item: TrashItem = { kind: home ? "home" : "room", id: home?.id ?? room!.id, name: home?.title ?? room!.name, deletedAt: timestamp, trashId: randomUUID(), ...(room ? { roomId: room.id } : {}) };
      if (home) {
        home.trash = item; home.lifecycleVersion = (home.lifecycleVersion ?? 0) + 1;
        for (const job of Object.values(home.jobs)) {
          if (!["running", "unknown", "save_pending"].includes(job.status)) continue;
          job.status = "cancelled"; job.phase = "done"; job.updatedAt = timestamp;
          job.error = { code: "HOME_TRASHED", message: "This request was cancelled when the home moved to trash. Restore the home to start a new request." };
          delete job.stagedRevisionId; delete job.stagedSummary;
        }
        homeOwner!.homeIds = homeOwner!.homeIds.filter(id => id !== home.id);
        if (homeOwner?.active?.homeId === home.id) delete homeOwner.active;
        transaction.putHomeOwner(uid, homeOwner!);
        transaction.putHome(home);
      }
      if (room) {
        room.trash = item; room.lifecycleVersion = (room.lifecycleVersion ?? 0) + 1;
        room.paused = true; room.observer.status = "paused";
        room.invite.expiresAt = 0;
        delete room.run; delete room.delivery;
        roomOwner!.trashedProjectIds = [...new Set([...(roomOwner!.trashedProjectIds ?? []), room.projectId])];
        if (roomOwner?.active?.roomId === room.id) delete roomOwner.active;
        transaction.putRoomOwner(uid, roomOwner!);
        if (delivery?.status === "pending") transaction.putDelivery({ ...delivery, status: "failed" });
        transaction.putRoom(room);
      }
      transaction.putReceipt(uid, input.requestId, { hash, result: item }); return item;
    });
  }
  async restore(uid: string, input: { kind: "home" | "room"; id: string; trashId: string; requestId: string }): Promise<RestoredItem> {
    const hash = homeHash({ action: "restore", ...input });
    return this.database.transaction(async transaction => {
      const previous = await this.replay(transaction, uid, input.requestId, hash);
      if (previous) return previous as RestoredItem;
      const { home, room } = await this.target(transaction, uid, input.kind, input.id);
      const item = home?.trash ?? room?.trash;
      if (!item || item.trashId !== input.trashId || item.kind !== input.kind || item.id !== input.id || (home && home.trash?.trashId !== input.trashId) || (room && room.trash?.trashId !== input.trashId)) throw changed();
      const homeOwner = home ? await transaction.getHomeOwner(uid) : undefined;
      const roomOwner = room ? await transaction.getRoomOwner(uid) : undefined;
      if (homeOwner && !homeOwner.homeIds.includes(home!.id) && homeOwner.homeIds.length >= HOME_LIMITS.homes) throw new AppError(409, "HOME_LIMIT", "Your workspace has 20 active homes. Move another home to trash before restoring this one.");
      if (roomOwner) {
        roomOwner.trashedProjectIds = (roomOwner.trashedProjectIds ?? []).filter(id => id !== room!.projectId);
        if (activeRoomProjectCount(roomOwner) > roomOwnerLimit(roomOwner)) throw new AppError(409, "ROOM_LIMIT", "Your workspace has reached its active shared-room limit. Move another room to trash before restoring this one.");
      }
      const result: RestoredItem = { kind: item.kind, id: item.id, ...(room ? { roomId: room.id } : {}) };
      if (home) { delete home.trash; homeOwner!.homeIds = [...new Set([...homeOwner!.homeIds, home.id])]; transaction.putHome(home); transaction.putHomeOwner(uid, homeOwner!); }
      if (room) { delete room.trash; transaction.putRoom(room); transaction.putRoomOwner(uid, roomOwner!); }
      transaction.putReceipt(uid, input.requestId, { hash, result }); return result;
    });
  }
}
export function registerLifecycleRoutes(app: Express, lifecycle: WorkspaceLifecycle) {
  const requestId = z.string().uuid(); const id = z.string().uuid();
  app.get("/api/trash", async (_request, response) => { response.json({ items: await lifecycle.list(response.locals.uid as string) }); });
  app.post("/api/homes/:homeId/trash", async (request, response) => {
    const input = z.object({ requestId, baseRevisionId: id.nullable() }).strict().parse(request.body);
    response.json({ item: await lifecycle.trash(response.locals.uid as string, "home", id.parse(request.params.homeId), input) });
  });
  app.post("/api/rooms/:roomId/trash", async (request, response) => {
    const input = z.object({ requestId }).strict().parse(request.body);
    response.json({ item: await lifecycle.trash(response.locals.uid as string, "room", id.parse(request.params.roomId), input) });
  });
  app.post("/api/trash/restore", async (request, response) => {
    const input = z.object({ kind: z.enum(["home", "room"]), id, trashId: id, requestId }).strict().parse(request.body);
    response.json(await lifecycle.restore(response.locals.uid as string, input));
  });
}
