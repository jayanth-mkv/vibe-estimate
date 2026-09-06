import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors.js";
import { newProject } from "./store.js";
import type { Analysis, StoredProject } from "./types.js";
import type { ReviewSnapshot, Room, RoomRole, SharedDraft, StoredRoom } from "./room-types.js";

export const ROOM_CALL_LIMIT = 10;
export const ROOM_OWNER_LIMIT = 10;
export const ROOM_MESSAGE_LIMIT = 40;
export const ROOM_TRANSCRIPT_LIMIT = 16000;
export const ROOM_DEBOUNCE_MS = 1500;
export const ROOM_LEASE_MS = 90000;
export const ROOM_INVITE_MS = 24 * 60 * 60 * 1000;
export const ROOM_TRANSCRIPT_MARKER = "\n\n--- Shared room conversation ---\n";
export const emptyRoomBody = z.object({}).strict();
export const roomMessageSchema = z.object({ text: z.string().trim().min(1).max(1000), requestId: z.string().uuid() }).strict();
export const roomJoinSchema = z.object({ inviteToken: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const normalizedJoinCode = z.string().min(12).max(32).transform(value => value.replace(/[\s-]/g, "").toUpperCase()).pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{12}$/));
export const roomJoinCodeSchema = z.object({ joinCode: normalizedJoinCode }).strict();
export const roomObserverSchema = z.object({ action: z.enum(["retry", "pause", "resume"]) }).strict();
export const roomNotFound = () => new AppError(404, "ROOM_NOT_FOUND", "This room could not be found.");

export function memberRole(room: StoredRoom | undefined, uid: string): RoomRole {
  if (!room) throw roomNotFound();
  if (room.ownerId === uid) return "designer";
  if (room.clientId === uid) return "client";
  throw roomNotFound();
}
export function requireDesigner(room: StoredRoom | undefined, uid: string): asserts room is StoredRoom {
  if (memberRole(room, uid) !== "designer") throw new AppError(403, "DESIGNER_REQUIRED", "Only the designer can make this change.");
}
export function newInvite(now: number) {
  const token = randomBytes(32).toString("base64url");
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  // Twelve independent five-bit symbols provide 60 bits of random invitation entropy.
  const compactCode = [...randomBytes(12)].map(value => alphabet[value & 31]).join("");
  const joinCode = `${compactCode.slice(0, 4)}-${compactCode.slice(4, 8)}-${compactCode.slice(8)}`;
  return { token, joinCode, stored: { hash: createHash("sha256").update(token).digest("hex"), codeHash: joinCodeHash(compactCode), expiresAt: now + ROOM_INVITE_MS } };
}
export function joinCodeHash(value: string) {
  return createHash("sha256").update("vibeestimate-room-code:" + normalizedJoinCode.parse(value)).digest("hex");
}
export function assertJoinCodeHash(room: StoredRoom, suppliedHash: string, now: number) {
  const expected = Buffer.from(room.invite.codeHash ?? "", "hex");
  const supplied = Buffer.from(suppliedHash, "hex");
  if (now >= room.invite.expiresAt || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError(403, "INVITE_INVALID", "This room code is invalid or has expired. Ask the designer for a new invitation.");
  }
}
export function assertInvite(room: StoredRoom, token: string, now: number) {
  const supplied = createHash("sha256").update(token).digest();
  const expected = Buffer.from(room.invite.hash, "hex");
  if (now >= room.invite.expiresAt || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError(403, "INVITE_INVALID", "This invitation is invalid or has expired. Ask the designer for a new invitation.");
  }
}
export function roomTranscript(room: Pick<StoredRoom, "sourceMessages" | "messages">, count = room.messages.length): string {
  const messages = room.messages.slice(0, count);
  if (!messages.length) return room.sourceMessages;
  return `${room.sourceMessages}${ROOM_TRANSCRIPT_MARKER}${messages.map((message, index) => `[Room message ${index + 1} — ${message.role === "client" ? "Client" : "Designer"}]\n${message.text}`).join("\n\n")}`;
}
export function newRoom(project: StoredProject, provider: Analysis["provider"], invite: StoredRoom["invite"], now: number): StoredRoom {
  if (project.roomId) throw new AppError(409, "ROOM_PROJECT", "Open the existing room for this draft instead of creating another room.");
  if (project.messages.length > 14000) throw new AppError(422, "ROOM_SOURCE_LIMIT", "Use a shorter source conversation before starting a room, so there is space for new messages.");
  const timestamp = new Date(now).toISOString();
  return {
    id: randomUUID(), projectId: project.id, ownerId: project.ownerId,
    name: project.name, scope: project.scope, sourceMessages: project.messages,
    invite, createdAt: timestamp, updatedAt: timestamp, messages: [],
    observer: { status: "watching", provider, reviewedMessageCount: 0, callsUsed: 0, callLimit: ROOM_CALL_LIMIT },
    paused: false, nextRunAt: 0, snapshots: [], sharedDrafts: []
  };
}
export function reviewProject(room: StoredRoom, count = room.messages.length): StoredProject {
  return {
    id: room.id, ownerId: room.ownerId, name: room.name, scope: room.scope,
    messages: roomTranscript(room, count), createdAt: room.createdAt, updatedAt: room.updatedAt,
    version: count, proposals: [], conversation: [], requests: {}
  };
}
export function currentSnapshot(room: StoredRoom): ReviewSnapshot {
  const snapshot = room.snapshots.findLast(item => item.messageCount === room.messages.length);
  if (room.observer.status !== "ready" || !room.observer.analysis || room.observer.reviewedMessageCount !== room.messages.length || !snapshot) {
    throw new AppError(409, "REVIEW_REQUIRED", "Wait for a successful review of the latest conversation before preparing a draft.");
  }
  return snapshot;
}
export function frozenProject(room: StoredRoom, snapshot: ReviewSnapshot): StoredProject {
  const source = reviewProject(room, snapshot.messageCount);
  const project = newProject(room.ownerId, { name: `${room.name.slice(0, 75)} · Room draft ${snapshot.messageCount}`, scope: room.scope, messages: source.messages });
  return {
    ...project, id: snapshot.projectId, roomId: room.id, analysis: structuredClone(snapshot.analysis), version: 1,
    // A later owner clarification can continue from the exact frozen evidence.
    conversation: [
      { role: "user", text: JSON.stringify({ task: "Review this original source text.", scope: source.scope, messages: source.messages, ownerClarification: null }) },
      { role: "model", text: JSON.stringify(snapshot.analysis) }
    ]
  };
}
export function checkedSharedDraft(room: StoredRoom, project: StoredProject | undefined, now: number): SharedDraft | undefined {
  if (!project || project.ownerId !== room.ownerId || project.id !== room.draftProjectId || project.roomId !== room.id) return;
  const snapshot = room.snapshots.find(item => item.projectId === project.id);
  const proposal = project.proposals.findLast(item => item.status === "draft");
  if (!snapshot || !proposal) return;
  if (!Number.isSafeInteger(proposal.quantity) || proposal.quantity < 1 || proposal.quantity > 1000
    || !Number.isSafeInteger(proposal.unitPricePaise) || proposal.unitPricePaise < 1 || proposal.unitPricePaise > 100000000
    || !Number.isSafeInteger(proposal.totalPaise) || proposal.totalPaise !== proposal.quantity * proposal.unitPricePaise
    || !proposal.description.trim() || proposal.description.length > 300) {
    throw new AppError(409, "DRAFT_INVALID", "The saved draft could not be verified. Review and save it again before sharing.");
  }
  const existing = room.sharedDrafts.find(item => item.id === proposal.id);
  if (existing) return existing;
  return {
    id: proposal.id, version: room.sharedDrafts.length + 1, projectId: project.id,
    description: proposal.description, quantity: proposal.quantity, unitPricePaise: proposal.unitPricePaise,
    totalPaise: proposal.totalPaise, createdAt: proposal.createdAt, sharedAt: new Date(now).toISOString(), messageCount: snapshot.messageCount
  };
}
export function publicRoom(room: StoredRoom, uid: string, shareableDraft?: SharedDraft): Room {
  const role = memberRole(room, uid);
  return {
    id: room.id, projectId: room.projectId, name: room.name, scope: room.scope, sourceMessages: room.sourceMessages,
    ...(room.homeId ? { homeId: room.homeId } : {}),
    createdAt: room.createdAt, updatedAt: room.updatedAt, role, clientJoined: Boolean(room.clientId),
    messages: room.messages.map(({ id, role: senderRole, text, createdAt }) => ({ id, role: senderRole, text, createdAt })),
    observer: structuredClone(room.observer), sharedDrafts: structuredClone(room.sharedDrafts),
    ...(role === "designer" && room.draftProjectId ? { draftProjectId: room.draftProjectId } : {}),
    ...(role === "designer" && shareableDraft ? { shareableDraft: structuredClone(shareableDraft) } : {})
  };
}
