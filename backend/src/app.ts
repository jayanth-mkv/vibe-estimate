import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import type { AnalysisProvider } from "./ai.js";
import type { AppConfig } from "./config.js";
import { analyzeSchema, createProjectSchema, exportProposal, proposalSchema } from "./domain.js";
import { AppError } from "./errors.js";
import type { ProjectStore } from "./store.js";
import { publicProject } from "./types.js";

export type AppDependencies = {
  config: AppConfig;
  store: ProjectStore;
  provider: AnalysisProvider;
  verifyToken: (token: string) => Promise<{ uid: string }>;
};

export function createApp({ config, store, provider, verifyToken }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "48kb" }));
  app.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/health", (_request, response) => {
    response.json({ status: "ok", aiProvider: provider.kind, storage: "firestore", auth: config.appEnv === "local" ? "emulator" : "firebase", ...(provider.kind === "gemini" ? { geminiTransport: config.geminiTransport ?? "developer" } : {}) });
  });
  const authenticate: RequestHandler = async (request, response, next) => {
    const header = request.header("authorization");
    const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
    if (!match?.[1]) { next(new AppError(401, "AUTH_REQUIRED", "Sign in to access your projects.")); return; }
    try {
      const identity = await verifyToken(match[1]);
      if (!identity.uid || identity.uid.includes("/")) throw new Error("Invalid identity");
      response.locals.uid = identity.uid;
      next();
    } catch { next(new AppError(401, "AUTH_REQUIRED", "Your session could not be verified. Please sign in again.")); }
  };
  app.use("/api", authenticate);
  app.use("/api", rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (_request, response) => String(response.locals.uid), message: { error: { code: "RATE_LIMIT", message: "Too many requests. Please wait a minute and try again." } } }));
  app.param("id", (request, _response, next, value: string) => { if (!z.string().uuid().safeParse(value).success) { next(new AppError(404, "PROJECT_NOT_FOUND", "This project could not be found.")); return; } next(); });
  app.get("/api/projects", async (_request, response) => {
    const projects = await store.list(response.locals.uid as string);
    response.json({ projects: projects.map(publicProject) });
  });
  app.post("/api/projects", async (request, response) => {
    const input = createProjectSchema.parse(request.body);
    const project = await store.create(response.locals.uid as string, input);
    response.status(201).json({ project: publicProject(project) });
  });
  app.get("/api/projects/:id", async (request, response) => {
    const project = await store.get(response.locals.uid as string, request.params.id as string);
    response.json({ project: publicProject(project) });
  });
  const aiLimiter = rateLimit({ windowMs: 60000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (_request, response) => String(response.locals.uid), message: { error: { code: "AI_RATE_LIMIT", message: "You have reached the review limit. Wait a minute before trying again." } } });
  app.post("/api/projects/:id/analyze", aiLimiter, async (request, response) => {
    const input = analyzeSchema.parse(request.body ?? {});
    const uid = response.locals.uid as string;
    const project = await store.get(uid, request.params.id as string);
    if (project.analysis && !input.clarification) { response.json({ project: publicProject(project) }); return; }
    const result = await provider.analyze(project, input.clarification);
    const updated = await store.saveAnalysis(uid, project.id, project.version, result.analysis, result.conversation);
    response.json({ project: publicProject(updated) });
  });
  app.post("/api/projects/:id/proposals", async (request, response) => {
    const input = proposalSchema.parse(request.body);
    const project = await store.appendProposal(response.locals.uid as string, request.params.id as string, input);
    response.json({ project: publicProject(project) });
  });
  app.get("/api/projects/:id/export", async (request, response) => {
    const project = await store.get(response.locals.uid as string, request.params.id as string);
    response.setHeader("Content-Disposition", 'attachment; filename="vibeestimate-draft.txt"');
    response.type("text/plain").send(exportProposal(project));
  });
  app.use((_request, _response, next) => next(new AppError(404, "NOT_FOUND", "This endpoint could not be found.")));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof AppError) { response.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
    if (error instanceof ZodError || (error instanceof SyntaxError && "body" in error)) { response.status(422).json({ error: { code: "INVALID_INPUT", message: "Check the supplied fields. Text is required; quantities and prices must be positive whole numbers within the supported limits." } }); return; }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { response.status(413).json({ error: { code: "INPUT_TOO_LARGE", message: "This source text is too long. Please use a shorter excerpt." } }); return; }
    // Never log source text, model content, authorization headers, or raw upstream errors.
    console.error(JSON.stringify({ event: "request_failed", code: "SERVICE_UNAVAILABLE" }));
    response.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "The project service is unavailable. Your change was not confirmed saved. Please reload and retry." } });
  };
  app.use(errors);
  return app;
}
