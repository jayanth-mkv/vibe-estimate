import { createHash, randomUUID } from "node:crypto";
import express, { type Express } from "express";
import { z } from "zod";
import { buildHouseFromPlan } from "@vibeestimate/scene-core";
import { planConfirmationSchema, planReadingSchema, type PlanReading } from "@vibeestimate/scene-schema";
import { AppError } from "./errors.js";
import { HomeModelError } from "./home-ai.js";
import { homeHash, HOME_LIMITS, type HomeStore } from "./home-store.js";
import type { HomeAIProvider, HomePlan, HomeRevision, StoredHome } from "./home-types.js";

export const PLAN_LIMITS = { bytes: 1024 * 1024, minSide: 200, maxSide: 4096, attempts: 2, leaseMs: 55_000 } as const;
export const PLAN_ASSUMPTIONS = [
  "Room sizes come from your uploaded plan and the scale you confirmed. Check them on site before ordering or building.",
  "Wall thickness, ceiling height, window sizes and door widths are standard assumptions, not measured.",
  "Furniture is a suggested starting arrangement from the catalog, with no supplier price or availability commitment.",
];
type ImageType = HomePlan["mimeType"];
const missing = () => new AppError(404, "HOME_NOT_FOUND", "This home project could not be found.");
const noPlan = () => new AppError(404, "PLAN_NOT_FOUND", "Upload a floor plan for this home first.");

/** Identify the real format from its bytes and read pixel dimensions from the header. */
export function inspectPlanImage(data: Buffer): { mimeType: ImageType; width: number; height: number } {
  const fail = () => { throw new AppError(422, "PLAN_IMAGE_UNSUPPORTED", "Upload a PNG, JPEG or WebP image of your floor plan."); };
  let mimeType: ImageType | null = null, width = 0, height = 0;
  if (data.length > 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && data.toString("latin1", 12, 16) === "IHDR") {
    mimeType = "image/png"; width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    mimeType = "image/jpeg";
    for (let i = 2; i + 9 < data.length;) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { height = data.readUInt16BE(i + 5); width = data.readUInt16BE(i + 7); break; }
      i += 2 + length;
    }
  } else if (data.length > 30 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
    mimeType = "image/webp";
    const chunk = data.toString("latin1", 12, 16);
    if (chunk === "VP8 ") { width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff; }
    else if (chunk === "VP8L") { const bits = data.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1; }
    else if (chunk === "VP8X") { width = 1 + data.readUIntLE(24, 3); height = 1 + data.readUIntLE(27, 3); }
  }
  if (!mimeType) fail();
  if (Math.min(width, height) < PLAN_LIMITS.minSide || Math.max(width, height) > PLAN_LIMITS.maxSide) throw new AppError(422, "PLAN_IMAGE_SIZE", `Use an image between ${PLAN_LIMITS.minSide} and ${PLAN_LIMITS.maxSide} pixels on each side.`);
  return { mimeType: mimeType!, width, height };
}

export class HomePlans {
  constructor(private store: HomeStore, private provider: HomeAIProvider, private now: () => number = Date.now) {}
  private owned(home: StoredHome | undefined, uid: string) { if (!home || home.ownerId !== uid || home.trash) throw missing(); return home; }

  async upload(uid: string, id: string, input: { requestId: string; data: Buffer }) {
    if (input.data.length > PLAN_LIMITS.bytes) throw new AppError(413, "PLAN_IMAGE_TOO_LARGE", "This image is larger than 1 MB. Try a smaller export or screenshot.");
    const image = inspectPlanImage(input.data), sha256 = createHash("sha256").update(input.data).digest("hex");
    const hash = homeHash({ requestId: input.requestId, sha256 });
    const before = await this.store.stored(uid, id), receipt = before.receipts[input.requestId];
    if (receipt) { if (receipt.kind !== "plan-upload" || receipt.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This upload request already saved a different image."); return this.store.get(uid, id); }
    // The same image already read for this home keeps its reading: no repeat model call.
    const reuse = before.plan?.sha256 === sha256 ? before.plan : undefined;
    const planId = reuse?.id ?? randomUUID();
    if (!reuse) await this.store.database.putPlanImage(uid, id, planId, { data: input.data, sha256, mimeType: image.mimeType });
    await this.store.database.transaction(async transaction => {
      const home = this.owned(await transaction.getHome(uid, id), uid);
      if ((home.lifecycleVersion ?? 0) !== (before.lifecycleVersion ?? 0)) throw new AppError(409, "HOME_CHANGED", "This home's deletion status changed. Refresh before uploading.");
      const existing = home.receipts[input.requestId];
      if (existing) { if (existing.kind !== "plan-upload" || existing.hash !== hash) throw new AppError(409, "REQUEST_REUSED", "This upload request already saved a different image."); return; }
      if (Object.keys(home.receipts).length >= HOME_LIMITS.requests) throw new AppError(422, "HOME_HISTORY_LIMIT", "This home has reached its saved-history limit.");
      if (!(home.plan && home.plan.id === planId)) home.plan = { id: planId, sha256, ...image, createdAt: new Date(this.now()).toISOString(), attempts: 0 };
      home.receipts[input.requestId] = { hash, kind: "plan-upload" }; home.updatedAt = new Date(this.now()).toISOString();
      transaction.putHome(home);
    });
    return this.store.get(uid, id);
  }

  async image(uid: string, id: string, planId: string) {
    const home = await this.store.stored(uid, id);
    if (home.plan?.id !== planId) throw noPlan();
    const image = await this.store.database.getPlanImage(uid, id, planId);
    if (!image) throw new AppError(503, "PLAN_UNAVAILABLE", "The plan image could not be loaded. Try again shortly.");
    return image;
  }

  /** One bounded model reading per call; attempts are reserved before dispatch and
   * an unknown outcome is recorded, never silently repeated. */
  async read(uid: string, id: string, planId: string) {
    const lease = await this.store.database.transaction(async transaction => {
      const home = this.owned(await transaction.getHome(uid, id), uid), owner = await transaction.getOwner(uid), plan = home.plan;
      if (!plan || plan.id !== planId) throw noPlan();
      if (plan.reading) return null;
      if (owner.active && owner.active.expiresAt > this.now()) throw new AppError(409, "HOME_JOB_RUNNING", "Another design request is running in your workspace. Try again when it finishes.");
      if (plan.attempts >= PLAN_LIMITS.attempts) throw new AppError(429, "PLAN_READ_LIMIT", "This plan has used its reading attempts. Upload a clearer image or choose a starting home.");
      if (home.callsUsed >= HOME_LIMITS.homeCalls || owner.callsUsed >= HOME_LIMITS.ownerCalls) throw new AppError(429, "HOME_AI_LIMIT", "This workspace has reached its AI allowance. Starting homes and manual edits remain available.");
      const model = this.provider.models[0]!, requestId = randomUUID(), expiresAt = this.now() + PLAN_LIMITS.leaseMs;
      plan.attempts++; delete plan.error; home.callsUsed++; owner.callsUsed++; owner.active = { homeId: id, requestId, expiresAt };
      transaction.putHome(home); transaction.putOwner(uid, owner);
      return { model, requestId };
    });
    if (!lease) return this.store.get(uid, id);
    let reading: PlanReading | undefined, failure: { code: string; message: string } | undefined;
    try {
      const image = await this.image(uid, id, planId), stored = await this.store.stored(uid, id);
      const output = await this.provider.readPlan({ data: image.data, mimeType: image.mimeType, width: stored.plan!.width, height: stored.plan!.height }, lease.model);
      const parsed = planReadingSchema.safeParse(output);
      if (!parsed.success || parsed.data.rooms.some(room => /not a floor plan/i.test(room.label))) failure = { code: "PLAN_NOT_READ", message: "We could not find rooms in this image. Try a clearer, straight-on picture of the plan, or choose a starting home." };
      else reading = parsed.data;
    } catch (error) {
      failure = error instanceof HomeModelError && error.outcome === "unknown"
        ? { code: "PLAN_OUTCOME_UNKNOWN", message: "The reading could not be confirmed. You can try once more; the earlier attempt is counted." }
        : { code: error instanceof AppError ? error.code : "PLAN_READ_FAILED", message: error instanceof AppError ? error.message : "The plan could not be read right now. Your upload is saved." };
    }
    await this.store.database.transaction(async transaction => {
      const home = this.owned(await transaction.getHome(uid, id), uid), owner = await transaction.getOwner(uid);
      if (home.plan?.id === planId) {
        if (reading) { home.plan.reading = reading; home.plan.provider = this.provider.kind; home.plan.model = lease.model; home.plan.readAt = new Date(this.now()).toISOString(); }
        else if (failure) home.plan.error = failure;
        transaction.putHome(home);
      }
      if (owner.active?.requestId === lease.requestId) { delete owner.active; transaction.putOwner(uid, owner); }
    });
    return this.store.get(uid, id);
  }

  async accept(uid: string, id: string, planId: string, input: { requestId: string; baseRevisionId: string | null; confirmation: z.infer<typeof planConfirmationSchema> }) {
    const home = await this.store.stored(uid, id), plan = home.plan;
    if (!plan || plan.id !== planId) throw noPlan();
    if (!plan.reading) throw new AppError(409, "PLAN_NOT_READ", "Read the plan before creating your home from it.");
    const hash = homeHash({ ...input, planId });
    if (await this.store.receipt(uid, id, input.requestId, "plan", hash)) return this.store.get(uid, id);
    if (input.baseRevisionId !== null) await this.store.revision(uid, id, input.baseRevisionId);
    let built: ReturnType<typeof buildHouseFromPlan>;
    try { built = buildHouseFromPlan(plan.reading, plan, input.confirmation); }
    catch (error) { throw new AppError(422, "PLAN_INVALID", error instanceof Error ? `This layout could not be built: ${error.message.slice(0, 300)}` : "This layout could not be built."); }
    const revision: HomeRevision = {
      id: randomUUID(), parentRevisionId: input.baseRevisionId, title: "Your home", description: `Created from your floor plan: ${built.rooms.length} room${built.rooms.length === 1 ? "" : "s"}.`,
      createdAt: new Date(this.now()).toISOString(), source: "plan", conflict: false, scene: built.document, requestId: input.requestId,
      brief: { title: "Your home", summary: "Your own floor plan, ready for your design brief.", source: "template", assumptions: [...PLAN_ASSUMPTIONS, ...built.issues.slice(0, 6)] },
      changes: built.rooms.map(room => `${room.name}: ${(room.widthMm / 1000).toFixed(1)} × ${(room.depthMm / 1000).toFixed(1)} m`).slice(0, 8),
    };
    return this.store.publish(uid, id, { requestId: input.requestId, baseRevisionId: input.baseRevisionId, hash, kind: "plan", revision, lifecycleVersion: home.lifecycleVersion ?? 0 });
  }
}

const uuid = z.string().uuid();
const asUuid = (value: unknown) => { const parsed = uuid.safeParse(value); if (!parsed.success) throw missing(); return parsed.data; };
export function registerPlanRoutes(app: Express, plans: HomePlans) {
  const raw = express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: PLAN_LIMITS.bytes });
  app.post("/api/homes/:homeId/plans", raw, async (request, response) => {
    if (!Buffer.isBuffer(request.body) || !request.body.length) throw new AppError(415, "PLAN_IMAGE_UNSUPPORTED", "Upload a PNG, JPEG or WebP image of your floor plan.");
    response.status(201).json({ home: await plans.upload(response.locals.uid as string, asUuid(request.params.homeId), { requestId: asUuid(request.query.requestId), data: request.body }) });
  });
  app.get("/api/homes/:homeId/plans/:planId/image", async (request, response) => {
    const image = await plans.image(response.locals.uid as string, asUuid(request.params.homeId), asUuid(request.params.planId));
    response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Content-Disposition", "inline"); response.type(image.mimeType).send(image.data);
  });
  app.post("/api/homes/:homeId/plans/:planId/read", async (request, response) => {
    z.strictObject({}).parse(request.body ?? {});
    response.json({ home: await plans.read(response.locals.uid as string, asUuid(request.params.homeId), asUuid(request.params.planId)) });
  });
  app.post("/api/homes/:homeId/plans/:planId/accept", async (request, response) => {
    const input = z.strictObject({ requestId: uuid, baseRevisionId: uuid.nullable(), confirmation: planConfirmationSchema }).parse(request.body);
    response.json({ home: await plans.accept(response.locals.uid as string, asUuid(request.params.homeId), asUuid(request.params.planId), input) });
  });
}
