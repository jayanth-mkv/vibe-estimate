import type { Analysis } from "./types";

export type RoomRole = "designer" | "client";

export interface RoomMessage {
  id: string;
  role: RoomRole;
  text: string;
  createdAt: string;
}

export interface RoomObserver {
  status: "watching" | "queued" | "thinking" | "ready" | "paused" | "error" | "limit";
  provider: "fixture" | "gemini";
  reviewedMessageCount: number;
  callsUsed: number;
  callLimit: number;
  analysis?: Analysis;
  error?: string;
  updatedAt?: string;
}

export interface SharedDraft {
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
}

export interface Room {
  id: string;
  homeId?: string;
  projectId: string;
  name: string;
  scope: string;
  sourceMessages: string;
  createdAt: string;
  updatedAt: string;
  role: RoomRole;
  clientJoined: boolean;
  messages: RoomMessage[];
  observer: RoomObserver;
  draftProjectId?: string;
  sharedDrafts: SharedDraft[];
  shareableDraft?: SharedDraft;
}
