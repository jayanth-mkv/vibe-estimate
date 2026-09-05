import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisProvider } from "../src/ai.js";
import { AppError } from "../src/errors.js";
import { FIXTURE_MESSAGES, FIXTURE_NAME, FIXTURE_SCOPE } from "../src/fixtures.js";
import { ROOM_CALL_LIMIT, ROOM_DEBOUNCE_MS, ROOM_LEASE_MS } from "../src/room-domain.js";
import { ROOM_GLOBAL_ACTIVE_LIMIT, RoomObserver } from "../src/room-observer.js";
import { RoomStore } from "../src/room-store.js";
import type { Analysis, StoredProject } from "../src/types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryRoomDatabase } from "./room-helpers.js";

describe("backend-owned room observer scheduling and spending boundaries", () => {
  let projects: MemoryProjectStore;
  let database: MemoryRoomDatabase;
  let rooms: RoomStore;
  let provider: AnalysisProvider;
  let observer: RoomObserver;
  let now: number;
  const validAnalysis = (): Analysis => ({ summary: "Kitchen lighting is included; display lights need an owner-reviewed draft.", included: ["3m LED strip is included."], proposed: ["Display lights are proposed."], questions: ["Confirm the draft quantity."], evidence: [{ source: "scope", quote: "Kitchen lighting: 3m LED strip included." }], provider: "gemini" });
  beforeEach(() => {
    now = 1750000000000;
    projects = new MemoryProjectStore(); database = new MemoryRoomDatabase(projects);
    rooms = new RoomStore(database, "gemini", () => now);
    provider = { kind: "gemini", analyze: vi.fn(async (_project: StoredProject) => ({ analysis: validAnalysis(), conversation: [] })) };
    observer = new RoomObserver(rooms, provider);
  });
  const create = async (owner = "owner") => {
    const project = await projects.create(owner, { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
    const created = await rooms.create(owner, project.id);
    await rooms.join(`${owner}-client`, created.room.id, created.inviteToken);
    return created.room.id;
  };
  const message = (id: string, text = "Could we quote 6 display lights?", owner = "owner") => rooms.message(`${owner}-client`, id, { text, requestId: randomUUID() });
  const flush = async () => { now += ROOM_DEBOUNCE_MS; await observer.tick(); await observer.idle(); };

  it("does not call from reads, creation or duplicate messages; debounces simultaneous messages into one review", async () => {
    const id = await create();
    for (let count = 0; count < 3; count++) { await rooms.get("owner", id); await observer.tick(); }
    expect(provider.analyze).not.toHaveBeenCalled();
    const input = { text: "Could we quote 6 display lights?", requestId: randomUUID() };
    await Promise.all([rooms.message("owner-client", id, input), rooms.message("owner-client", id, input)]);
    await observer.tick();
    expect(provider.analyze).not.toHaveBeenCalled();
    now += 1000;
    await message(id, "Please keep the kitchen lighting included.");
    now += 500;
    await observer.tick();
    expect(provider.analyze).not.toHaveBeenCalled();
    now += 1000;
    await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    const modelInput = vi.mocked(provider.analyze).mock.calls[0]![0];
    expect(modelInput.messages).toContain("[Room message 1 — Client]");
    expect(modelInput.messages).toContain("[Room message 2 — Client]");
    expect(modelInput.conversation).toEqual([]);
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "ready", callsUsed: 1, reviewedMessageCount: 2 });
    await rooms.message("owner-client", id, input);
    await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(1);
  });

  it("holds one persisted active call per owner across rooms and concurrent worker instances", async () => {
    const first = await create(); const second = await create();
    let release!: () => void;
    vi.mocked(provider.analyze).mockImplementation(async () => { await new Promise<void>(resolve => { release = resolve; }); return { analysis: validAnalysis(), conversation: [] }; });
    await message(first); await message(second); now += ROOM_DEBOUNCE_MS;
    const otherWorker = new RoomObserver(rooms, provider);
    await Promise.all([observer.tick(), otherWorker.tick()]);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(database.owners.get("owner")!.active).toBeDefined();
    release(); await observer.idle(); await otherWorker.idle();
    expect(database.owners.get("owner")!.active).toBeUndefined();
    vi.mocked(provider.analyze).mockResolvedValue({ analysis: validAnalysis(), conversation: [] });
    await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(2);
    expect((await rooms.get("owner", first)).observer.status).toBe("ready");
    expect((await rooms.get("owner", second)).observer.status).toBe("ready");
  });

  it("caps process-wide in-flight reviews across different owners", async () => {
    const releases: (() => void)[] = [];
    vi.mocked(provider.analyze).mockImplementation(async () => { await new Promise<void>(resolve => releases.push(resolve)); return { analysis: validAnalysis(), conversation: [] }; });
    for (let count = 0; count < ROOM_GLOBAL_ACTIVE_LIMIT + 2; count++) {
      const owner = `owner-${count}`; const id = await create(owner); await message(id, "Could we quote 6 display lights?", owner);
    }
    now += ROOM_DEBOUNCE_MS; await observer.tick();
    expect(provider.analyze).toHaveBeenCalledTimes(ROOM_GLOBAL_ACTIVE_LIMIT);
    releases.forEach(release => release()); await observer.idle();
    vi.mocked(provider.analyze).mockResolvedValue({ analysis: validAnalysis(), conversation: [] });
    await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(ROOM_GLOBAL_ACTIVE_LIMIT + 2);
  });

  it("reserves capacity before concurrent managed task claims and leaves excess rooms uncharged", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(provider.analyze).mockImplementation(async () => { await gate; return { analysis: validAnalysis(), conversation: [] }; });
    const ids: string[] = [];
    for (let count = 0; count < ROOM_GLOBAL_ACTIVE_LIMIT + 2; count++) {
      const owner = `owner-${count}`; const id = await create(owner); await message(id, "Could we quote 6 display lights?", owner); ids.push(id);
    }
    now += ROOM_DEBOUNCE_MS;
    const deliveries = ids.map(id => observer.process(id).then(() => undefined, error => error));
    try {
      await vi.waitFor(() => { expect(provider.analyze).toHaveBeenCalledTimes(ROOM_GLOBAL_ACTIVE_LIMIT); });
      for (const id of ids.slice(ROOM_GLOBAL_ACTIVE_LIMIT)) {
        expect(database.rooms.get(id)!.observer).toMatchObject({ status: "queued", callsUsed: 0 });
      }
    } finally { release(); }
    const results = await Promise.all(deliveries);
    expect(results.slice(0, ROOM_GLOBAL_ACTIVE_LIMIT)).toEqual(Array(ROOM_GLOBAL_ACTIVE_LIMIT).fill(undefined));
    for (const result of results.slice(ROOM_GLOBAL_ACTIVE_LIMIT)) expect(result).toMatchObject({ code: "WORKER_BUSY", status: 503 });
    await Promise.all(ids.slice(ROOM_GLOBAL_ACTIVE_LIMIT).map(id => observer.process(id)));
    expect(provider.analyze).toHaveBeenCalledTimes(ROOM_GLOBAL_ACTIVE_LIMIT + 2);
  });

  it("shares a pending managed claim and releases its slot when Firestore fails", async () => {
    const id = await create(); await message(id); now += ROOM_DEBOUNCE_MS;
    let rejectClaim!: (error: Error) => void;
    const pendingClaim = new Promise<never>((_resolve, reject) => { rejectClaim = reject; });
    const claim = vi.spyOn(rooms, "claim").mockImplementationOnce(() => pendingClaim);
    const first = observer.process(id).catch(error => error);
    const duplicate = observer.process(id).catch(error => error);
    await vi.waitFor(() => { expect(claim).toHaveBeenCalledTimes(1); });
    expect(provider.analyze).not.toHaveBeenCalled();
    const failure = new Error("Synthetic unavailable transaction");
    rejectClaim(failure);
    expect(await Promise.all([first, duplicate])).toEqual([failure, failure]);
    await observer.process(id);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "ready", callsUsed: 1 });
  });

  it("retains stale review history but never presents or prepares stale results as current", async () => {
    const id = await create();
    let release!: () => void;
    vi.mocked(provider.analyze).mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { analysis: validAnalysis(), conversation: [] }; });
    await message(id); now += ROOM_DEBOUNCE_MS; await observer.tick();
    await message(id, "Could we revise the draft to 4 display lights?");
    release(); await observer.idle();
    const stale = await rooms.get("owner", id);
    expect(stale.observer).toMatchObject({ status: "queued", reviewedMessageCount: 0, callsUsed: 1 });
    expect(stale.observer.analysis).toBeUndefined();
    await expect(rooms.prepare("owner", id)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    expect(database.rooms.get(id)!.snapshots).toHaveLength(1);
    expect(database.rooms.get(id)!.snapshots[0]!.messageCount).toBe(1);
    await flush();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "ready", reviewedMessageCount: 2, callsUsed: 2 });
    expect((await rooms.prepare("owner", id)).messages).toContain("revise the draft to 4");
    expect(database.rooms.get(id)!.snapshots).toHaveLength(2);
  });

  it("pauses future observation immediately and never turns an old in-flight result into a current review", async () => {
    const id = await create(); await rooms.control("owner", id, "pause"); await message(id); await flush();
    expect(provider.analyze).not.toHaveBeenCalled();
    await rooms.control("owner", id, "resume");
    let release!: () => void;
    vi.mocked(provider.analyze).mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { analysis: validAnalysis(), conversation: [] }; });
    await observer.tick(); await rooms.control("owner", id, "pause");
    await message(id, "A later room message.");
    release(); await observer.idle();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "paused", reviewedMessageCount: 0, callsUsed: 1 });
    await expect(rooms.prepare("owner", id)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    await rooms.control("owner", id, "resume"); await observer.tick(); await observer.idle();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "ready", reviewedMessageCount: 2, callsUsed: 2 });
  });

  it("sanitizes provider failure, preserves messages and retries only by explicit owner action", async () => {
    const id = await create();
    vi.mocked(provider.analyze).mockRejectedValueOnce(new Error("private token and provider source response"));
    await message(id); await flush();
    const failed = await rooms.get("owner-client", id);
    expect(failed.observer.status).toBe("error");
    expect(failed.observer.error).not.toContain("private token");
    expect(failed.messages).toHaveLength(1);
    await message(id, "Another persisted message."); await flush();
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    await expect(rooms.control("owner-client", id, "retry")).rejects.toMatchObject({ status: 403 });
    await rooms.control("owner", id, "pause"); await rooms.control("owner", id, "resume"); await observer.tick();
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect((await rooms.get("owner", id)).observer.status).toBe("error");
    await rooms.control("owner", id, "retry"); await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(2);
    expect((await rooms.get("owner", id)).observer.status).toBe("ready");
  });

  it("enforces a durable ten-call budget even when every call fails and retries are requested", async () => {
    const id = await create();
    vi.mocked(provider.analyze).mockRejectedValue(new AppError(502, "AI_UNAVAILABLE", "upstream private details"));
    await message(id); await flush();
    for (let index = 1; index < ROOM_CALL_LIMIT; index++) { await rooms.control("owner", id, "retry"); await observer.tick(); await observer.idle(); }
    expect(provider.analyze).toHaveBeenCalledTimes(ROOM_CALL_LIMIT);
    await rooms.control("owner", id, "retry"); await observer.tick(); await observer.idle();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "limit", callsUsed: ROOM_CALL_LIMIT });
    const restarted = new RoomObserver(new RoomStore(database, "gemini", () => now), provider);
    await message(id, "Keep this message even after the model budget is exhausted."); await restarted.tick(); await restarted.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(ROOM_CALL_LIMIT);
    expect((await rooms.get("owner", id)).messages).toHaveLength(2);
  });

  it("recovers an interrupted persistent lease as an explicit error without spending another call", async () => {
    const id = await create(); await message(id); now += ROOM_DEBOUNCE_MS;
    const claimed = await rooms.claim(id);
    expect(claimed).toBeDefined();
    now += ROOM_LEASE_MS;
    await observer.tick(); await observer.idle();
    expect(provider.analyze).not.toHaveBeenCalled();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "error", callsUsed: 1 });
    expect(database.owners.get("owner")!.active).toBeUndefined();
    await rooms.finish(id, claimed!.run.id, { analysis: validAnalysis() });
    expect((await rooms.get("owner", id)).observer.analysis).toBeUndefined();
    await rooms.control("owner", id, "retry"); await observer.tick(); await observer.idle();
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect((await rooms.get("owner", id)).observer.callsUsed).toBe(2);
  });

  it("revalidates provider evidence against the frozen transcript instead of trusting the provider interface", async () => {
    const id = await create();
    vi.mocked(provider.analyze).mockResolvedValue({ analysis: { ...validAnalysis(), evidence: [{ source: "messages", quote: "An invented client approval." }] }, conversation: [] });
    await message(id); await flush();
    expect((await rooms.get("owner", id)).observer).toMatchObject({ status: "error", callsUsed: 1 });
    expect((await rooms.get("owner", id)).observer.error).toContain("could not be verified");
    expect(database.rooms.get(id)!.snapshots).toEqual([]);
  });

  it("does not replace a fixture room with a paid Gemini call after a runtime mode change", async () => {
    const fixtureStore = new RoomStore(database, "fixture", () => now);
    const project = await projects.create("owner", { name: FIXTURE_NAME, scope: FIXTURE_SCOPE, messages: FIXTURE_MESSAGES });
    const { room } = await fixtureStore.create("owner", project.id);
    await fixtureStore.message("owner", room.id, { text: "Kitchen lighting stays included. Client approval has not been collected.", requestId: randomUUID() });
    await flush();
    expect(provider.analyze).not.toHaveBeenCalled();
    expect((await rooms.get("owner", room.id)).observer).toMatchObject({ status: "error", callsUsed: 0, provider: "fixture" });
  });

  it("bounds owner room creation, message count and assembled transcript without partial writes", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 10; index++) ids.push(await create());
    await expect(create()).rejects.toMatchObject({ code: "ROOM_LIMIT" });
    expect(database.rooms.size).toBe(10);
    const id = ids[0]!;
    await rooms.control("owner", id, "pause");
    for (let index = 0; index < 40; index++) await message(id, `Short message ${index}`);
    await expect(message(id)).rejects.toMatchObject({ code: "MESSAGE_LIMIT" });
    expect((await rooms.get("owner", id)).messages).toHaveLength(40);
    const longId = ids[1]!;
    await rooms.control("owner", longId, "pause");
    for (let index = 0; index < 15; index++) await message(longId, "x".repeat(1000));
    await expect(message(longId, "x".repeat(1000))).rejects.toMatchObject({ code: "TRANSCRIPT_LIMIT" });
    expect((await rooms.get("owner", longId)).messages).toHaveLength(15);
  });
});
