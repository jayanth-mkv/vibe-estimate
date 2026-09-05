import type { AnalysisProvider } from "./ai.js";
import { validateAnalysis } from "./domain.js";
import { AppError } from "./errors.js";
import { reviewProject } from "./room-domain.js";
import { roomFixtureAnalysis } from "./room-fixture.js";
import type { ClaimedReview, RoomStore } from "./room-store.js";
import type { Analysis } from "./types.js";

export const ROOM_GLOBAL_ACTIVE_LIMIT = 4;

function safeReviewFailure(error: unknown): string {
  if (error instanceof AppError && (error.code === "ROOM_FIXTURE_UNSUPPORTED" || error.code === "FIXTURE_UNSUPPORTED")) {
    return "The local room sample supports only its supplied lighting messages. Your conversation is saved; enable Gemini for other text.";
  }
  if (error instanceof AppError && error.code === "AI_INVALID_RESPONSE") {
    return "The agent's review could not be verified against the conversation. Your messages are saved. Retry when you are ready.";
  }
  return "The agent could not finish this review. Your conversation is saved. Retry when you are ready.";
}

/** Server-owned observation. Reads/polling never invoke a model, and one persistent claim equals at most one call. */
export class RoomObserver {
  private timer?: ReturnType<typeof setInterval>;
  private wakeup?: ReturnType<typeof setTimeout>;
  private polling = false;
  private stopped = false;
  private running = new Map<string, Promise<void>>();
  constructor(private store: RoomStore, private provider: AnalysisProvider) {}

  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.tick(); }, 30000);
    this.timer.unref();
    void this.tick();
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); if (this.wakeup) clearTimeout(this.wakeup); this.timer = undefined; }

  /** Local event-driven wakeup; the slower scan only recovers interrupted local work. */
  notify() {
    if (this.wakeup) clearTimeout(this.wakeup);
    this.wakeup = setTimeout(() => { this.wakeup = undefined; void this.tick(); }, 1600);
    this.wakeup.unref();
  }

  /** A managed task awaits the whole operation, keeping Cloud Run CPU allocated. */
  async process(id: string) {
    if (this.running.has(id)) { await this.running.get(id); return; }
    if (this.running.size >= ROOM_GLOBAL_ACTIVE_LIMIT) throw new AppError(503, "WORKER_BUSY", "The review worker is busy.");
    // Reserve the slot before awaiting Firestore. Concurrent task deliveries
    // share a pending claim and cannot all pass the capacity check together.
    const work = Promise.resolve().then(async () => {
      const claim = await this.store.claim(id);
      if (claim) await this.perform(claim);
    }).finally(() => { this.running.delete(id); });
    this.running.set(id, work);
    await work;
  }

  async tick() {
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      const ids = await this.store.scheduledIds();
      for (const id of ids) {
        if (this.running.size >= ROOM_GLOBAL_ACTIVE_LIMIT) break;
        if (this.stopped || this.running.has(id)) continue;
        const claim = await this.store.claim(id);
        if (!claim) continue;
        const work = this.perform(claim).catch(() => {
          // No source text, identifiers, invite values, credentials or raw upstream errors.
          console.error(JSON.stringify({ event: "room_observer_save_unavailable" }));
        }).finally(() => { this.running.delete(id); });
        this.running.set(id, work);
      }
    } catch {
      console.error(JSON.stringify({ event: "room_observer_store_unavailable" }));
    } finally { this.polling = false; }
  }
  /** Tests and graceful shutdown can await already-started work; this does not trigger any calls. */
  async idle() { await Promise.all([...this.running.values()]); }

  private async perform({ room, run }: ClaimedReview) {
    let result: { analysis: Analysis } | { error: string };
    try {
      const project = reviewProject(room, run.messageCount);
      const analysis = this.provider.kind === "fixture" ? roomFixtureAnalysis(room) : (await this.provider.analyze(project)).analysis;
      const { provider: _provider, ...output } = analysis;
      const verified = validateAnalysis(output, project, this.provider.kind);
      // Ten retained reviews plus bounded messages/drafts fit comfortably within a Firestore document.
      if (Buffer.byteLength(JSON.stringify(verified), "utf8") > 24000) throw new AppError(502, "AI_INVALID_RESPONSE", "The review is too large to store safely.");
      result = { analysis: verified };
    } catch (error) { result = { error: safeReviewFailure(error) }; }
    await this.store.finish(room.id, run.id, result);
  }
}
