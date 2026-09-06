import type { Express } from "express";
import { z } from "zod";
import { catalog, designSelectionSchema, housePatchSchema } from "@vibeestimate/scene-schema";
import { homeTemplates } from "@vibeestimate/scene-core";
import { AppError } from "./errors.js";
import type { HomeService } from "./home-service.js";
import { publicProject } from "./types.js";

const uuid = z.string().uuid();
export const homeMutationSchema = z.strictObject({ requestId: uuid, baseRevisionId: uuid });
export const homeGenerationSchema = homeMutationSchema.extend({ prompt: z.string().trim().min(1).max(2000), selection: designSelectionSchema });
export const homeEditSchema = homeMutationSchema.extend({ patch: housePatchSchema, selection: designSelectionSchema });
const asUuid = (value: unknown) => { const parsed = uuid.safeParse(value); if (!parsed.success) throw new AppError(404, "HOME_NOT_FOUND", "This home project could not be found."); return parsed.data; };

export function registerHomeRoutes(app: Express, service: HomeService) {
  app.get("/api/home-templates", (_request, response) => response.json({ templates: homeTemplates.map(({ document: _document, ...template }) => template) }));
  app.get("/api/catalog", (_request, response) => response.json({ assets: catalog }));
  app.get("/api/homes", async (_request, response) => response.json({ homes: await service.store.list(response.locals.uid as string) }));
  app.post("/api/homes", async (request, response) => {
    const input = z.strictObject({ requestId: uuid }).parse(request.body);
    response.status(201).json({ home: await service.store.create(response.locals.uid as string, input.requestId) });
  });
  app.get("/api/homes/:homeId", async (request, response) => response.json({ home: await service.store.get(response.locals.uid as string, asUuid(request.params.homeId)) }));
  app.post("/api/homes/:homeId/template", async (request, response) => {
    const input = z.strictObject({ requestId: uuid, baseRevisionId: uuid.nullable(), templateId: z.string().min(1).max(80) }).parse(request.body);
    response.json({ home: await service.template(response.locals.uid as string, asUuid(request.params.homeId), input) });
  });
  app.post("/api/homes/:homeId/generate", async (request, response) => response.json(await service.generate(response.locals.uid as string, asUuid(request.params.homeId), homeGenerationSchema.parse(request.body))));
  app.get("/api/homes/:homeId/jobs/:requestId", async (request, response) => {
    const uid = response.locals.uid as string; const id = asUuid(request.params.homeId);
    response.json({ job: await service.store.job(uid, id, asUuid(request.params.requestId)), home: await service.store.get(uid, id) });
  });
  app.post("/api/homes/:homeId/jobs/:requestId/cancel", async (request, response) => {
    const input = z.strictObject({ requestId: uuid }).parse(request.body); const requestId = asUuid(request.params.requestId);
    if (input.requestId !== requestId) throw new AppError(422, "INVALID_INPUT", "The cancellation must identify this saved request.");
    const uid = response.locals.uid as string; const id = asUuid(request.params.homeId);
    response.json({ home: await service.store.fail(uid, id, requestId, "cancelled"), job: await service.store.job(uid, id, requestId) });
  });
  app.post("/api/homes/:homeId/jobs/:requestId/resume", async (request, response) => {
    const input = z.strictObject({ requestId: uuid }).parse(request.body); const requestId = asUuid(request.params.requestId);
    if (input.requestId !== requestId) throw new AppError(422, "INVALID_INPUT", "The save must identify this request.");
    const uid = response.locals.uid as string; const id = asUuid(request.params.homeId);
    response.json({ home: await service.store.resume(uid, id, requestId), job: await service.store.job(uid, id, requestId) });
  });
  app.post("/api/homes/:homeId/revisions", async (request, response) => response.json({ home: await service.edit(response.locals.uid as string, asUuid(request.params.homeId), homeEditSchema.parse(request.body)) }));
  app.post("/api/homes/:homeId/restore", async (request, response) => response.json({ home: await service.restore(response.locals.uid as string, asUuid(request.params.homeId), homeMutationSchema.extend({ revisionId: uuid }).parse(request.body)) }));
  app.get("/api/homes/:homeId/revisions/:revisionId", async (request, response) => response.json({ revision: await service.store.revision(response.locals.uid as string, asUuid(request.params.homeId), asUuid(request.params.revisionId)) }));
  app.post("/api/homes/:homeId/summary", async (request, response) => response.json(await service.summarize(response.locals.uid as string, asUuid(request.params.homeId), homeMutationSchema.parse(request.body))));
  app.get("/api/homes/:homeId/export", async (request, response) => {
    const summary = await service.store.summary(response.locals.uid as string, asUuid(request.params.homeId), asUuid(request.query.revisionId));
    response.setHeader("Content-Disposition", 'attachment; filename="vibeestimate-design.md"'); response.type("text/markdown").send(summary.markdown);
  });
  app.post("/api/homes/:homeId/proposal", async (request, response) => {
    const result = await service.proposal(response.locals.uid as string, asUuid(request.params.homeId), homeMutationSchema.parse(request.body));
    response.json({ home: result.home, project: publicProject(result.project) });
  });
}
