import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fitPlanScale, validateHouse } from "@vibeestimate/scene-core";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { FixtureProvider } from "../src/ai.js";
import { FixtureHomeProvider } from "../src/home-ai.js";
import { inspectPlanImage, PLAN_LIMITS } from "../src/home-plans.js";
import { HomeService } from "../src/home-service.js";
import { HomeStore } from "../src/home-store.js";
import type { HomeProject } from "../src/home-types.js";
import { MemoryProjectStore } from "./helpers.js";
import { MemoryHomeDatabase } from "./home-helpers.js";
vi.setConfig({ testTimeout: 30_000 });

/** A real PNG signature and IHDR header; pixel data is irrelevant to the server. */
function png(width: number, height: number, extra = 64) {
  const header = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8); header.write("IHDR", 12, "latin1"); header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
  header[24] = 8; header[25] = 2; header[33] = width % 251;
  return header;
}
function jpeg(width: number, height: number) {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255]), Buffer.alloc(40)]);
}

describe("floor-plan upload, reading and confirmation", () => {
  let database: MemoryHomeDatabase; let provider: FixtureHomeProvider; let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    const projects = new MemoryProjectStore(); database = new MemoryHomeDatabase(projects); provider = new FixtureHomeProvider();
    app = createApp({ config: readConfig({}), store: projects, provider: new FixtureProvider(), homes: new HomeService(new HomeStore(database), provider, projects), verifyToken: async token => ({ uid: token }) });
  });
  const as = (uid: string) => ({ post: (path: string) => request(app).post(path).set("Authorization", `Bearer ${uid}`), get: (path: string) => request(app).get(path).set("Authorization", `Bearer ${uid}`) });
  const owner = as("owner"), other = as("other");
  async function home() { return (await owner.post("/api/homes").send({ requestId: randomUUID() }).expect(201)).body.home as HomeProject; }
  const upload = (id: string, data: Buffer, requestId = randomUUID(), who = owner, type = "image/png") => who.post(`/api/homes/${id}/plans?requestId=${requestId}`).set("Content-Type", type).send(data);

  it("identifies real image types and dimensions from bytes, not the declared type", () => {
    expect(inspectPlanImage(png(1600, 1200))).toEqual({ mimeType: "image/png", width: 1600, height: 1200 });
    expect(inspectPlanImage(jpeg(1280, 960))).toEqual({ mimeType: "image/jpeg", width: 1280, height: 960 });
    expect(() => inspectPlanImage(Buffer.from("<svg onload=alert(1)>"))).toThrow(/PNG, JPEG or WebP/);
    expect(() => inspectPlanImage(png(100, 100))).toThrow(/between 200 and 4096/);
    expect(() => inspectPlanImage(png(5000, 1000))).toThrow(/between 200 and 4096/);
  });

  it("requires sign-in, keeps plans private to their owner and rejects unsafe or oversized uploads", async () => {
    const target = await home();
    await request(app).post(`/api/homes/${target.id}/plans?requestId=${randomUUID()}`).set("Content-Type", "image/png").send(png(800, 600)).expect(401);
    await upload(target.id, png(800, 600), randomUUID(), other).expect(404);
    await upload(target.id, Buffer.from("<svg/>"), randomUUID(), owner, "image/png").expect(422);
    await upload(target.id, png(800, 600), randomUUID(), owner, "text/plain").expect(415);
    await upload(target.id, Buffer.concat([png(800, 600), Buffer.alloc(PLAN_LIMITS.bytes)])).expect(413);
    const saved = (await upload(target.id, png(800, 600)).expect(201)).body.home as HomeProject;
    await other.get(`/api/homes/${target.id}/plans/${saved.plan!.id}/image`).expect(404);
    const image = await owner.get(`/api/homes/${target.id}/plans/${saved.plan!.id}/image`).expect(200);
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(image.headers["content-type"]).toMatch(/^image\/png/);
    await other.post(`/api/homes/${target.id}/plans/${saved.plan!.id}/read`).send({}).expect(404);
  });

  it("replays an upload safely and refuses a reused request with a different image", async () => {
    const target = await home(), requestId = randomUUID();
    const first = (await upload(target.id, png(800, 600), requestId).expect(201)).body.home as HomeProject;
    const again = (await upload(target.id, png(800, 600), requestId).expect(201)).body.home as HomeProject;
    expect(again.plan!.id).toBe(first.plan!.id);
    await upload(target.id, png(900, 600), requestId).expect(409);
  });

  it("reads once, reuses the reading for the same image and creates a validated home from one confirmation", async () => {
    const target = await home(); const spy = vi.spyOn(provider, "readPlan");
    const uploaded = (await upload(target.id, png(1000, 800)).expect(201)).body.home as HomeProject;
    const planId = uploaded.plan!.id;
    await owner.post(`/api/homes/${target.id}/plans/${planId}/accept`).send({ requestId: randomUUID(), baseRevisionId: null, confirmation: { names: ["A"], removedRooms: [], mmPerPixel: 10, furnish: true } }).expect(409);
    const read = (await owner.post(`/api/homes/${target.id}/plans/${planId}/read`).send({}).expect(200)).body.home as HomeProject;
    expect(read.plan!.reading!.rooms).toHaveLength(2);
    expect(read.plan!.provider).toBe("fixture");
    await owner.post(`/api/homes/${target.id}/plans/${planId}/read`).send({}).expect(200);
    const reuploaded = (await upload(target.id, png(1000, 800)).expect(201)).body.home as HomeProject;
    expect(reuploaded.plan!.id).toBe(planId); expect(reuploaded.plan!.reading).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(1);

    const fit = fitPlanScale(read.plan!.reading!, read.plan!);
    expect(fit.status).toBe("confirmed");
    const body = { requestId: randomUUID(), baseRevisionId: null, confirmation: { names: ["Living room", "Main bedroom"], removedRooms: [], mmPerPixel: fit.mmPerPixel!, furnish: true } };
    const created = (await owner.post(`/api/homes/${target.id}/plans/${planId}/accept`).send(body).expect(200)).body.home as HomeProject;
    expect(created.revisions).toHaveLength(1);
    expect(created.revisions[0]!.source).toBe("plan");
    expect(validateHouse(created.scene)).toEqual(created.scene);
    expect(created.scene!.rooms.map(room => room.name)).toEqual(["Living room", "Main bedroom"]);
    expect(created.scene!.instances.length).toBeGreaterThan(2);
    expect(created.brief!.assumptions.join(" ")).toMatch(/scale you confirmed/);
    expect(((await owner.post(`/api/homes/${target.id}/plans/${planId}/accept`).send(body).expect(200)).body.home as HomeProject).revisions).toHaveLength(1);
    await owner.post(`/api/homes/${target.id}/plans/${planId}/accept`).send({ ...body, confirmation: { ...body.confirmation, names: ["X", "Y"] } }).expect(409);
  });

  it("records an unreadable image without repeating it, and stops after the bounded attempts", async () => {
    const target = await home();
    vi.spyOn(provider, "readPlan").mockResolvedValue({ rooms: [], doors: [], windows: [], texts: [], notes: [] });
    const planId = ((await upload(target.id, png(800, 600)).expect(201)).body.home as HomeProject).plan!.id;
    const failed = (await owner.post(`/api/homes/${target.id}/plans/${planId}/read`).send({}).expect(200)).body.home as HomeProject;
    expect(failed.plan!.error!.code).toBe("PLAN_NOT_READ"); expect(failed.plan!.attempts).toBe(1); expect(failed.plan!.reading).toBeUndefined();
    await owner.post(`/api/homes/${target.id}/plans/${planId}/read`).send({}).expect(200);
    await owner.post(`/api/homes/${target.id}/plans/${planId}/read`).send({}).expect(429);
    expect(database.owners.get("owner")!.active).toBeUndefined();
  });
});
