import type { HomeProject, HomeReviewSource } from "./home-types.js";
import type { Room, RoomRole } from "./room-types.js";

export type DesignAssistant = { id: string; name: string; introduction: string; instructions: string; createdAt: string };
export type DesignDecision = { id: string; revisionId: string; role: RoomRole; action: "accept" | "approve"; createdAt: string };
export type DesignAgreement = { id: string; revisionId: string; title: string; markdown: string; createdAt: string; provider: "fixture" | "gemini"; model: string; status: "draft"; source: HomeReviewSource };
export type DesignAssistantReply = { id: string; requestId: string; revisionId: string; text: string; changes: string[]; createdAt: string; provider: "fixture" | "gemini"; model: string; assistantId: string; status: "complete" | "conflict" };
export type SharedHome = {
  room: Room; home: HomeProject; role: RoomRole; assistant: DesignAssistant;
  decisions: DesignDecision[]; acceptedRevisionId: string | null; approvedRevisionId: string | null;
  agreements: DesignAgreement[]; canAccept: boolean; canApprove: boolean; canGenerateAgreement: boolean;
  assistantReplies: DesignAssistantReply[];
};
export type StoredDesignAssistant = DesignAssistant & { ownerId: string; requestId: string };
export type StoredDesignDecision = DesignDecision & { actorId: string; requestId: string };
export type StoredHomeRoom = {
  roomId: string; homeId: string; ownerId: string; assistant: DesignAssistant;
  decisions: StoredDesignDecision[]; agreements: DesignAgreement[];
  assistantReplies?: DesignAssistantReply[];
  requests: Record<string, { actorId: string; hash: string; resultId: string }>;
};
