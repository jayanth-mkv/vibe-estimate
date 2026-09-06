import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { DesignSelection, HousePatch } from "@vibeestimate/scene-schema";
import { describeDesignChanges } from "@vibeestimate/scene-core";
import { AppError } from "./errors.js";
import { homeHash } from "./home-store.js";
import type { HomeService } from "./home-service.js";
import type { HomeGenerationInput, HomeJob, StoredHome } from "./home-types.js";
import type { RoomStore } from "./room-store.js";
import { memberRole, requireDesigner } from "./room-domain.js";
import type { StoredRoom } from "./room-types.js";
import type { DesignAgreement, DesignAssistant, DesignAssistantReply, SharedHome, StoredDesignAssistant, StoredHomeRoom } from "./home-collaboration-types.js";

export type AssistantIndex = { profiles: Record<string, StoredDesignAssistant>; receipts: Record<string, { hash: string; id: string }> };
export interface HomeCollaborationTransaction {
  getRoom(roomId: string): Promise<StoredRoom | undefined>;
  getLink(roomId: string): Promise<StoredHomeRoom | undefined>;
  putLink(link: StoredHomeRoom): void;
  getHome(ownerId: string, homeId: string): Promise<StoredHome | undefined>;
  putHome(home: StoredHome): void;
  getIndex(uid: string): Promise<Record<string, string>>;
  putIndex(uid: string, index: Record<string, string>): void;
  getAssistants(uid: string): Promise<AssistantIndex>;
  putAssistants(uid: string, index: AssistantIndex): void;
}
export interface HomeCollaborationDatabase { transaction<T>(operation: (transaction: HomeCollaborationTransaction) => Promise<T>): Promise<T> }
export class FirestoreHomeCollaborationDatabase implements HomeCollaborationDatabase {
  constructor(private db: Firestore) {}
  transaction<T>(operation: (transaction: HomeCollaborationTransaction) => Promise<T>) {
    return this.db.runTransaction(transaction => operation({
      getRoom: async id => (await transaction.get(this.db.collection("rooms").doc(id))).data() as StoredRoom | undefined,
      getLink: async id => (await transaction.get(this.db.collection("homeRooms").doc(id))).data() as StoredHomeRoom | undefined,
      putLink: link => { if (Buffer.byteLength(JSON.stringify(link)) > 800_000) throw new AppError(422, "ROOM_HISTORY_LIMIT", "This room has reached its saved-history limit."); transaction.set(this.db.collection("homeRooms").doc(link.roomId), link); },
      getHome: async (uid, id) => (await transaction.get(this.db.collection("users").doc(uid).collection("homes").doc(id))).data() as StoredHome | undefined,
      putHome: home => { transaction.set(this.db.collection("users").doc(home.ownerId).collection("homes").doc(home.id), home); },
      getIndex: async uid => ((await transaction.get(this.db.collection("homeRoomOwners").doc(uid))).data()?.homes as Record<string, string> | undefined) ?? {},
      putIndex: (uid, index) => { transaction.set(this.db.collection("homeRoomOwners").doc(uid), { homes: index }); },
      getAssistants: async uid => ((await transaction.get(this.db.collection("designAssistants").doc(uid))).data() as AssistantIndex | undefined) ?? { profiles: {}, receipts: {} },
      putAssistants: (uid, index) => { transaction.set(this.db.collection("designAssistants").doc(uid), index); },
    }));
  }
}

const DEFAULT_ASSISTANT = { name: "Home design assistant", introduction: "Describe how you want your home to feel. I can help you choose furniture, finishes and lights, then keep each saved design ready for your review.", instructions: "Keep the design calm, practical and comfortable. Respect selected rooms, door clearances, existing locks and the admitted asset catalog. Explain proposed changes briefly." };
const publicAssistant = ({ id, name, introduction, instructions, createdAt }: StoredDesignAssistant): DesignAssistant => ({ id, name, introduction, instructions, createdAt });
const noSharedHome = () => new AppError(404, "SHARED_HOME_NOT_FOUND", "This shared home could not be found.");
const plain = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|#]/g, "");

export class HomeCollaboration {
  constructor(readonly database: HomeCollaborationDatabase, private homes: HomeService, private rooms: RoomStore) {}
  async assistants(uid: string) {
    return this.database.transaction(async transaction => Object.values((await transaction.getAssistants(uid)).profiles).map(publicAssistant));
  }
  async createAssistant(uid: string, input: { requestId: string; name?: string; introduction?: string; instructions?: string }) {
    return this.database.transaction(async transaction => {
      const index = await transaction.getAssistants(uid); const hash = homeHash(input); const receipt = index.receipts[input.requestId];
      if (receipt) { if (receipt.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This assistant request already used different settings."); return publicAssistant(index.profiles[receipt.id]!); }
      if (Object.keys(index.profiles).length >= 12) throw new AppError(422, "ASSISTANT_LIMIT", "Your workspace has reached its 12-assistant limit.");
      const profile: StoredDesignAssistant = { ...DEFAULT_ASSISTANT, ...input, id: randomUUID(), ownerId: uid, createdAt: new Date().toISOString() };
      index.profiles[profile.id] = profile; index.receipts[input.requestId] = { hash, id: profile.id }; transaction.putAssistants(uid, index); return publicAssistant(profile);
    });
  }
  private async checked(uid: string, roomId: string) {
    return this.database.transaction(async transaction => {
      const room = await transaction.getRoom(roomId); const role = memberRole(room, uid);
      const link = await transaction.getLink(roomId);
      if (!link || room!.ownerId !== link.ownerId) throw noSharedHome();
      return { link, role };
    });
  }
  async createRoom(uid: string, homeId: string, input: { requestId: string; assistantId?: string }) {
    const home = await this.homes.store.get(uid, homeId);
    if (!home.headRevisionId) throw new AppError(409, "LAYOUT_REQUIRED", "Choose a starting layout before inviting someone to design it with you.");
    const existingId = await this.database.transaction(async transaction => (await transaction.getIndex(uid))[homeId]);
    if (existingId) return this.get(uid, existingId);
    let assistant: DesignAssistant;
    if (input.assistantId) {
      const found = (await this.assistants(uid)).find(item => item.id === input.assistantId);
      if (!found) throw new AppError(404, "ASSISTANT_NOT_FOUND", "This design assistant could not be found."); assistant = found;
    } else assistant = await this.createAssistant(uid, { requestId: input.requestId });
    const source = await this.homes.proposal(uid, homeId, { requestId: input.requestId, baseRevisionId: home.headRevisionId });
    const result = await this.rooms.create(uid, source.project.id);
    // This room has an explicit selected-design assistant. The old textual scope
    // observer stays paused, so one message cannot trigger two paid workflows.
    await this.rooms.attachHome(uid, result.room.id, homeId);
    const roomId = await this.database.transaction(async transaction => {
      const index = await transaction.getIndex(uid); if (index[homeId]) return index[homeId]!;
      const room = await transaction.getRoom(result.room.id); requireDesigner(room, uid);
      const currentHome = await transaction.getHome(uid, homeId);
      if (!currentHome || currentHome.ownerId !== uid) throw noSharedHome();
      const link: StoredHomeRoom = { roomId: room.id, homeId, ownerId: uid, assistant, decisions: [], agreements: [], requests: {} };
      currentHome.roomId = room.id; index[homeId] = room.id; transaction.putLink(link); transaction.putIndex(uid, index); transaction.putHome(currentHome); return room.id;
    });
    return { ...await this.get(uid, roomId), ...(roomId === result.room.id ? { inviteToken: result.inviteToken, joinCode: result.joinCode } : await this.rooms.invite(uid, roomId)) };
  }
  async get(uid: string, roomId: string): Promise<SharedHome> {
    const { link, role } = await this.checked(uid, roomId);
    const home = await this.homes.store.get(link.ownerId, link.homeId);
    const accepted = link.decisions.findLast(item => item.action === "accept" && item.revisionId === home.headRevisionId);
    const approved = link.decisions.findLast(item => item.action === "approve" && item.revisionId === home.headRevisionId);
    return {
      room: await this.rooms.get(uid, roomId), home: { ...home, proposalProjectId: null }, role, assistant: role === "designer" ? link.assistant : { ...link.assistant, instructions: "" },
      decisions: link.decisions.map(({ actorId: _actor, requestId: _request, ...decision }) => decision),
      acceptedRevisionId: accepted?.revisionId ?? null, approvedRevisionId: approved?.revisionId ?? null,
      agreements: link.agreements, canAccept: role === "client" && Boolean(home.headRevisionId) && !accepted,
      assistantReplies: link.assistantReplies ?? [],
      canApprove: role === "designer" && Boolean(accepted) && !approved,
      canGenerateAgreement: role === "designer" && Boolean(accepted && approved) && !link.agreements.some(item => item.revisionId === home.headRevisionId),
    };
  }
  async generate(uid: string, roomId: string, input: HomeGenerationInput) {
    const { link } = await this.checked(uid, roomId);
    const result = await this.homes.generate(link.ownerId, link.homeId, input, { actorId: uid, assistant: { name: link.assistant.name, instructions: link.assistant.instructions } });
    await this.recordReply(uid, roomId, result.job);
    return { ...await this.get(uid, roomId), job: result.job };
  }
  private async recordReply(uid: string, roomId: string, job: HomeJob) {
    if (job.kind !== "generate" || !job.resultRevisionId || !["complete", "conflict"].includes(job.status)) return;
    const { link } = await this.checked(uid, roomId);
    const revision = await this.homes.store.revision(link.ownerId, link.homeId, job.resultRevisionId);
    if (revision.source !== "gemini" && revision.source !== "fixture") return;
    const reply: DesignAssistantReply = {
      id: job.requestId, requestId: job.requestId, revisionId: revision.id, text: revision.description,
      changes: revision.changes ?? [], createdAt: job.updatedAt, provider: revision.source,
      model: revision.model ?? job.model ?? "unknown", assistantId: link.assistant.id, status: job.status as "complete" | "conflict",
    };
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(roomId); memberRole(room, uid); const current = await transaction.getLink(roomId);
      if (!current || room!.ownerId !== current.ownerId) throw noSharedHome();
      current.assistantReplies ??= [];
      if (current.assistantReplies.some(item => item.requestId === job.requestId)) return;
      current.assistantReplies.push(reply); transaction.putLink(current);
    });
  }
  async edit(uid: string, roomId: string, input: { requestId: string; baseRevisionId: string; patch: HousePatch; selection: DesignSelection }) {
    const { link } = await this.checked(uid, roomId);
    await this.homes.edit(link.ownerId, link.homeId, input);
    return this.get(uid, roomId);
  }
  async message(uid: string, roomId: string, input: { text: string; requestId: string; askAssistant: boolean; baseRevisionId: string; selection: DesignSelection }) {
    await this.checked(uid, roomId);
    await this.rooms.message(uid, roomId, { text: input.text, requestId: input.requestId });
    if (input.askAssistant) return this.generate(uid, roomId, { prompt: input.text, requestId: input.requestId, baseRevisionId: input.baseRevisionId, selection: input.selection });
    return this.get(uid, roomId);
  }
  async job(uid: string, roomId: string, requestId: string) {
    const { link } = await this.checked(uid, roomId);
    return { ...await this.get(uid, roomId), job: await this.homes.store.job(link.ownerId, link.homeId, requestId) };
  }
  async revision(uid: string, roomId: string, revisionId: string) {
    const { link } = await this.checked(uid, roomId);
    return this.homes.store.revision(link.ownerId, link.homeId, revisionId);
  }
  async cancel(uid: string, roomId: string, requestId: string) {
    const { link } = await this.checked(uid, roomId);
    await this.homes.store.fail(link.ownerId, link.homeId, requestId, "cancelled");
    return this.job(uid, roomId, requestId);
  }
  async resume(uid: string, roomId: string, requestId: string) {
    const { link, role } = await this.checked(uid, roomId);
    const job = await this.homes.store.job(link.ownerId, link.homeId, requestId);
    if (job.kind === "agreement" && role !== "designer") throw new AppError(403, "DESIGN_ROLE_REQUIRED", "The designer must finish preparing this draft agreement.");
    await this.homes.store.resume(link.ownerId, link.homeId, requestId);
    if (job.kind === "agreement") return this.agreement(uid, roomId, { requestId, revisionId: job.baseRevisionId });
    await this.recordReply(uid, roomId, await this.homes.store.job(link.ownerId, link.homeId, requestId));
    return this.job(uid, roomId, requestId);
  }
  async decision(uid: string, roomId: string, action: "accept" | "approve", input: { requestId: string; revisionId: string }) {
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(roomId); const role = memberRole(room, uid); const link = await transaction.getLink(roomId);
      if (!link || room!.ownerId !== link.ownerId) throw noSharedHome();
      const home = await transaction.getHome(link.ownerId, link.homeId);
      if (!home || home.ownerId !== link.ownerId) throw noSharedHome();
      if (action === "accept" ? role !== "client" : role !== "designer") throw new AppError(403, "DESIGN_ROLE_REQUIRED", action === "accept" ? "The homeowner must accept their chosen design." : "The designer must approve the homeowner's chosen design.");
      const hash = homeHash({ action, ...input }); const previous = link.requests[input.requestId];
      if (previous) { if (previous.actorId !== uid || previous.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This review request was already used with different values."); return; }
      if (home.headRevisionId !== input.revisionId) throw new AppError(409, "DESIGN_CHANGED", "The design has changed. Review the latest saved version before deciding.");
      if (action === "approve" && !link.decisions.some(item => item.action === "accept" && item.revisionId === input.revisionId)) throw new AppError(409, "HOMEOWNER_ACCEPTANCE_REQUIRED", "Wait for the homeowner to accept this exact design version.");
      if (link.decisions.length >= 80 || Object.keys(link.requests).length >= 100) throw new AppError(422, "ROOM_HISTORY_LIMIT", "This room has reached its review-history limit.");
      const decision = { id: randomUUID(), revisionId: input.revisionId, role, action, createdAt: new Date().toISOString(), actorId: uid, requestId: input.requestId };
      link.decisions.push(decision); link.requests[input.requestId] = { actorId: uid, hash, resultId: decision.id }; transaction.putLink(link);
    });
    return this.get(uid, roomId);
  }
  private async agreementAuthority(uid: string, roomId: string, revisionId: string) {
    return this.database.transaction(async transaction => {
      const room = await transaction.getRoom(roomId); requireDesigner(room, uid); const link = await transaction.getLink(roomId);
      if (!link || link.ownerId !== uid) throw noSharedHome();
      const home = await transaction.getHome(uid, link.homeId);
      if (!home || home.headRevisionId !== revisionId) throw new AppError(409, "DESIGN_CHANGED", "The design has changed. Review and choose its latest version before preparing an agreement.");
      const accepted = link.decisions.findLast(item => item.action === "accept" && item.revisionId === revisionId);
      const approved = link.decisions.findLast(item => item.action === "approve" && item.revisionId === revisionId);
      if (!accepted || !approved) throw new AppError(409, "DESIGN_REVIEW_REQUIRED", "The homeowner must accept and the designer must approve this exact design before a draft agreement can be prepared.");
      return { link, accepted, approved };
    });
  }
  async agreement(uid: string, roomId: string, input: { requestId: string; revisionId: string }) {
    const { link, accepted, approved } = await this.agreementAuthority(uid, roomId, input.revisionId);
    const hash = homeHash({ kind: "agreement", ...input }); const receipt = link.requests[input.requestId];
    if (receipt && (receipt.actorId !== uid || receipt.hash !== hash)) throw new AppError(409, "REQUEST_REUSED", "This request was already used with different values.");
    if (link.agreements.some(item => item.revisionId === input.revisionId)) return this.get(uid, roomId);
    if (link.agreements.length >= 20) throw new AppError(422, "AGREEMENT_LIMIT", "This room has reached its 20-draft-agreement limit.");
    const current = await this.homes.store.get(uid, link.homeId);
    const baseline = await this.homes.store.revision(uid, link.homeId, current.revisions[0]!.id);
    const selected = await this.homes.store.revision(uid, link.homeId, input.revisionId);
    const room = await this.rooms.get(uid, roomId);
    const reviewSource = { startingRevisionId: baseline.id, acceptedDecisionId: accepted.id, approvedDecisionId: approved.id, messages: room.messages, changes: describeDesignChanges(baseline.scene, selected.scene) };
    const result = await this.homes.draftAgreement(uid, link.homeId, { requestId: input.requestId, baseRevisionId: input.revisionId }, uid, reviewSource);
    if (result.job.status !== "complete") return { ...await this.get(uid, roomId), job: result.job };
    const prose = await this.homes.store.summary(uid, link.homeId, input.revisionId, "agreement");
    const agreement: DesignAgreement = {
      id: randomUUID(), revisionId: input.revisionId, title: `Draft design agreement · ${prose.title}`, createdAt: new Date().toISOString(), provider: prose.provider, model: prose.model, status: "draft", source: prose.reviewSource ?? reviewSource,
      markdown: ["# Draft design agreement", "", `Design: ${plain(prose.title)}`, `Saved design revision: ${input.revisionId}`, `Starting layout revision: ${(prose.reviewSource ?? reviewSource).startingRevisionId}`, `Homeowner design acceptance: ${accepted.createdAt} (${accepted.id})`, `Designer design approval: ${approved.createdAt} (${approved.id})`, "", "## Proposed design intent", "", plain(prose.narrative), "", "## Verified changes from the starting layout", "", ...((prose.reviewSource ?? reviewSource).changes.length ? (prose.reviewSource ?? reviewSource).changes.map(change => `- ${plain(change)}`) : ["- The chosen starting layout was retained."]), "", "## Source conversation", "", ...(prose.reviewSource ?? reviewSource).messages.map(message => `- ${message.role === "client" ? "Homeowner" : "Designer"} · ${message.createdAt} · ${message.id}: ${plain(message.text)}`), "", "## What the participants chose", "", "The homeowner selected and the designer approved the exact saved design revision above. These are design-review decisions, not signatures or a legally executed agreement.", "", "## Terms still to be agreed", "", "- Site measurements, installation feasibility and any statutory requirements.", "- Detailed scope of work, supplied products and installation responsibilities.", "- Fees, taxes, payment schedule and any third-party costs.", "- Programme, revisions, cancellation terms and signatures.", "", "No prices, payment obligations, site instructions or start date are created by this draft.", "", "## Saved design schedule", "", prose.markdown, ""].join("\n"),
    };
    await this.database.transaction(async transaction => {
      const room = await transaction.getRoom(roomId); requireDesigner(room, uid); const current = await transaction.getLink(roomId);
      if (!current || current.ownerId !== uid) throw noSharedHome();
      const home = await transaction.getHome(uid, current.homeId);
      if (home?.headRevisionId !== input.revisionId || !current.decisions.some(item => item.action === "accept" && item.revisionId === input.revisionId) || !current.decisions.some(item => item.action === "approve" && item.revisionId === input.revisionId)) throw new AppError(409, "DESIGN_CHANGED", "The design changed while its agreement was prepared. The current design remains unchanged; review it before generating another draft.");
      if (current.agreements.some(item => item.revisionId === input.revisionId)) return;
      current.agreements.push(agreement); current.requests[input.requestId] = { actorId: uid, hash, resultId: agreement.id }; transaction.putLink(current);
    });
    return this.get(uid, roomId);
  }
  async exportAgreement(uid: string, roomId: string, agreementId: string) {
    const { link } = await this.checked(uid, roomId); const agreement = link.agreements.find(item => item.id === agreementId);
    if (!agreement) throw new AppError(404, "AGREEMENT_NOT_FOUND", "This saved draft agreement could not be found."); return agreement;
  }
}
