import type { Analysis } from "./types.js";

export type RoomRole = "designer" | "client";
export type RoomMessage = { id: string; role: RoomRole; text: string; createdAt: string };
export type ObserverStatus = "watching" | "queued" | "thinking" | "ready" | "paused" | "error" | "limit";
export type Observer = {
  status: ObserverStatus;
  provider: Analysis["provider"];
  reviewedMessageCount: number;
  callsUsed: number;
  callLimit: number;
  analysis?: Analysis;
  error?: string;
  updatedAt?: string;
};
export type SharedDraft = {
  id: string;
  version: number;
  projectId: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  createdAt: string;
  sharedAt: string;
  messageCount: number;
};
export type Room = {
  id: string;
  projectId: string;
  name: string;
  scope: string;
  sourceMessages: string;
  createdAt: string;
  updatedAt: string;
  role: RoomRole;
  clientJoined: boolean;
  messages: RoomMessage[];
  observer: Observer;
  draftProjectId?: string;
  sharedDrafts: SharedDraft[];
  shareableDraft?: SharedDraft;
};
export type StoredRoomMessage = RoomMessage & { senderId: string; requestId: string };
export type ReviewSnapshot = {
  messageCount: number;
  analysis: Analysis;
  createdAt: string;
  projectId: string;
};
export type ObserverRun = { id: string; messageCount: number; leaseUntil: number };
export type StoredRoom = Omit<Room, "role" | "clientJoined" | "messages" | "shareableDraft"> & {
  ownerId: string;
  clientId?: string;
  invite: { hash: string; expiresAt: number };
  messages: StoredRoomMessage[];
  paused: boolean;
  nextRunAt: number;
  run?: ObserverRun;
  snapshots: ReviewSnapshot[];
};
export type RoomOwner = {
  projects: Record<string, string>;
  active?: { roomId: string; runId: string; leaseUntil: number };
};
