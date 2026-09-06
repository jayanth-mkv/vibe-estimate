import type { Express } from "express";
import { z } from "zod";
import { designSelectionSchema } from "@vibeestimate/scene-schema";
import { AppError } from "./errors.js";
import type { HomeCollaboration } from "./home-collaboration.js";
import { homeEditSchema, homeGenerationSchema } from "./home-routes.js";

const uuid = z.string().uuid();
const decision = z.strictObject({ requestId: uuid, revisionId: uuid });
const parseId = (value: unknown) => { const result = uuid.safeParse(value); if (!result.success) throw new AppError(404, "SHARED_HOME_NOT_FOUND", "This shared home could not be found."); return result.data; };
export function registerHomeCollaborationRoutes(app: Express, collaboration: HomeCollaboration) {
  app.get("/api/design-assistants", async (_request, response) => response.json({ assistants: await collaboration.assistants(response.locals.uid as string) }));
  app.post("/api/design-assistants", async (request, response) => {
    const input = z.strictObject({ requestId: uuid, name: z.string().trim().min(1).max(80).optional(), introduction: z.string().trim().min(1).max(500).optional(), instructions: z.string().trim().min(1).max(1500).optional() }).parse(request.body);
    response.status(201).json({ assistant: await collaboration.createAssistant(response.locals.uid as string, input) });
  });
  app.post("/api/homes/:homeId/room", async (request, response) => {
    const input = z.strictObject({ requestId: uuid, assistantId: uuid.optional() }).parse(request.body);
    response.json(await collaboration.createRoom(response.locals.uid as string, parseId(request.params.homeId), input));
  });
  app.get("/api/rooms/:roomId/home", async (request, response) => response.json(await collaboration.get(response.locals.uid as string, parseId(request.params.roomId))));
  app.post("/api/rooms/:roomId/home/generate", async (request, response) => response.json(await collaboration.generate(response.locals.uid as string, parseId(request.params.roomId), homeGenerationSchema.parse(request.body))));
  app.post("/api/rooms/:roomId/home/revisions", async (request, response) => response.json(await collaboration.edit(response.locals.uid as string, parseId(request.params.roomId), homeEditSchema.parse(request.body))));
  app.get("/api/rooms/:roomId/home/revisions/:revisionId", async (request, response) => response.json({ revision: await collaboration.revision(response.locals.uid as string, parseId(request.params.roomId), parseId(request.params.revisionId)) }));
  app.post("/api/rooms/:roomId/home/messages", async (request, response) => {
    const input = z.strictObject({ text: z.string().trim().min(1).max(1500), requestId: uuid, askAssistant: z.boolean(), baseRevisionId: uuid, selection: designSelectionSchema }).parse(request.body);
    response.json(await collaboration.message(response.locals.uid as string, parseId(request.params.roomId), input));
  });
  app.get("/api/rooms/:roomId/home/jobs/:requestId", async (request, response) => response.json(await collaboration.job(response.locals.uid as string, parseId(request.params.roomId), parseId(request.params.requestId))));
  app.post("/api/rooms/:roomId/home/jobs/:requestId/cancel", async (request, response) => {
    const input = z.strictObject({ requestId: uuid }).parse(request.body); const requestId = parseId(request.params.requestId);
    if (input.requestId !== requestId) throw new AppError(422, "INVALID_INPUT", "The cancellation must identify this request.");
    response.json(await collaboration.cancel(response.locals.uid as string, parseId(request.params.roomId), requestId));
  });
  app.post("/api/rooms/:roomId/home/jobs/:requestId/resume", async (request, response) => {
    const input = z.strictObject({ requestId: uuid }).parse(request.body); const requestId = parseId(request.params.requestId);
    if (input.requestId !== requestId) throw new AppError(422, "INVALID_INPUT", "The save must identify this request.");
    response.json(await collaboration.resume(response.locals.uid as string, parseId(request.params.roomId), requestId));
  });
  app.post("/api/rooms/:roomId/home/accept", async (request, response) => response.json(await collaboration.decision(response.locals.uid as string, parseId(request.params.roomId), "accept", decision.parse(request.body))));
  app.post("/api/rooms/:roomId/home/approve", async (request, response) => response.json(await collaboration.decision(response.locals.uid as string, parseId(request.params.roomId), "approve", decision.parse(request.body))));
  app.post("/api/rooms/:roomId/home/agreements", async (request, response) => response.json(await collaboration.agreement(response.locals.uid as string, parseId(request.params.roomId), decision.parse(request.body))));
  app.get("/api/rooms/:roomId/home/agreements/:agreementId/export", async (request, response) => {
    const agreement = await collaboration.exportAgreement(response.locals.uid as string, parseId(request.params.roomId), parseId(request.params.agreementId));
    response.setHeader("Content-Disposition", 'attachment; filename="vibeestimate-design-agreement-draft.md"'); response.type("text/markdown").send(agreement.markdown);
  });
}
