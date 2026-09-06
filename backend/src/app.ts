import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import type { AnalysisProvider } from "./ai.js";
import type { AppConfig } from "./config.js";
import { analyzeSchema, createProjectSchema, exportProposal, proposalSchema } from "./domain.js";
import { AppError } from "./errors.js";
import { ReviewRequestError, type AnalysisDecision } from "./analysis-requests.js";
import type { ProjectStore } from "./store.js";
import { publicProject, publicReviewRequest, type StoredProject } from "./types.js";
import { registerRoomRoutes } from "./room-routes.js";
import type { RoomStore } from "./room-store.js";
import type { RoomObserver } from "./room-observer.js";
import type { RoomTasks } from "./room-tasks.js";
import type { HomeService } from "./home-service.js";
import { registerHomeRoutes } from "./home-routes.js";
import type { HomeCollaboration } from "./home-collaboration.js";
import { registerHomeCollaborationRoutes } from "./home-collaboration-routes.js";

export type AppDependencies = {
  config: AppConfig;
  store: ProjectStore;
  provider: AnalysisProvider;
  verifyToken: (token: string) => Promise<{ uid: string }>;
  rooms?: RoomStore;
  observer?: RoomObserver;
  tasks?: RoomTasks;
  notifyRoom?: (id: string) => Promise<void>;
  homes?: HomeService;
  homeCollaboration?: HomeCollaboration;
};

export function createApp({ config, store, provider, verifyToken, rooms, observer, tasks, notifyRoom, homes, homeCollaboration }: AppDependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "48kb" }));
  app.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); });
  if (config.appEnv === "production" && rooms && observer && tasks) {
    app.use("/internal", async (request, _response, next) => {
      const token = /^Bearer ([^\s]+)$/.exec(request.header("authorization") ?? "")?.[1];
      if (!token || !await tasks.verify(token)) return next(new AppError(401, "TASK_AUTH_REQUIRED", "A verified task identity is required."));
      next();
    });
    app.post("/internal/observer", async (request, response) => {
      const { roomId } = z.object({ roomId: z.string().uuid() }).strict().parse(request.body);
      await observer.process(roomId);
      if (await rooms.hasPendingReview(roomId)) throw new AppError(503, "TASK_PENDING", "The saved review is waiting for an available worker.");
      response.status(204).end();
    });
    app.post("/internal/reconcile", async (_request, response) => {
      for (const id of await rooms.scheduledIds()) await tasks.enqueue(id);
      response.status(204).end();
    });
  }
  app.get("/health", (_request, response) => {
    response.json({ status: "ok", aiProvider: provider.kind, storage: "firestore", auth: config.appEnv === "local" ? "emulator" : "firebase", storageConnection: config.appEnv === "local" ? "emulator" : "cloud", runtime: config.appEnv, ...(config.gitRevision ? { gitRevision: config.gitRevision } : {}), ...(provider.kind === "gemini" ? { geminiTransport: config.geminiTransport ?? "developer" } : {}) });
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
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (typeof code === "string" && ["CONNECTED_AUTH_UNAVAILABLE", "auth/internal-error", "auth/insufficient-permission", "auth/invalid-credential", "app/invalid-credential", "app/network-error", "app/network-timeout"].includes(code)) {
        next(new AppError(503, "AUTH_UNAVAILABLE", "Your sign-in could not be checked right now. Keep this session and retry shortly."));
      } else next(new AppError(401, "AUTH_REQUIRED", "Your session could not be verified. Please sign in again."));
    }
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
  const accepted = (decision: AnalysisDecision) => {
    if (decision.kind === "error") throw decision.error;
    return decision;
  };
  const reviewFailure = async (uid: string, id: string, requestId: string, status: "failed" | "unknown", error?: unknown) => {
    let project: StoredProject;
    try { project = await store.failAnalysis(uid, id, requestId, status); }
    catch {
      return new ReviewRequestError(503, "REVIEW_OUTCOME_UNKNOWN", "The review status could not be confirmed saved. Check this request again before choosing a new review.", { requestId, status: "unknown", retryAllowed: false });
    }
    const reviewRequest = publicReviewRequest(project);
    if (reviewRequest?.status === "save_pending") return new ReviewRequestError(503, "REVIEW_SAVE_PENDING", "The generated review is saved and waiting to be applied. Finish saving this request without starting another review.", reviewRequest);
    if (error instanceof AppError) return new ReviewRequestError(error.status, error.code, error.message, reviewRequest);
    return new ReviewRequestError(status === "failed" ? 502 : 503, status === "failed" ? "AI_UNAVAILABLE" : "REVIEW_OUTCOME_UNKNOWN", status === "failed" ? "The AI review did not finish. Check your project before explicitly choosing to retry." : "The generated review could not be confirmed saved. Check this request before explicitly choosing a new review.", reviewRequest);
  };
  app.post("/api/projects/:id/analyze", aiLimiter, async (request, response) => {
    const input = analyzeSchema.parse(request.body ?? {});
    const uid = response.locals.uid as string;
    const id = request.params.id as string;
    let decision = accepted(await store.beginAnalysis(uid, id, input));
    if (decision.kind === "dispatch") {
      let result: Awaited<ReturnType<AnalysisProvider["analyze"]>>;
      try { result = await provider.analyze(decision.project, decision.clarification); }
      catch (error) { throw await reviewFailure(uid, id, decision.requestId, "failed", error); }
      // Save only the generated delta before applying it to the project. A failed
      // final save can then resume on another instance without a paid redispatch.
      // One bounded retry here repeats a persistence write, never generation.
      let staged: AnalysisDecision;
      try { staged = await store.stageAnalysis(uid, id, decision.requestId, result.analysis, result.conversation); }
      catch (error) {
        if (error instanceof AppError) throw await reviewFailure(uid, id, decision.requestId, "failed", error);
        try { staged = await store.stageAnalysis(uid, id, decision.requestId, result.analysis, result.conversation); }
        catch (retryError) { throw await reviewFailure(uid, id, decision.requestId, "unknown", retryError instanceof AppError ? retryError : undefined); }
      }
      decision = accepted(staged);
    }
    if (decision.kind === "save") {
      let completed: AnalysisDecision;
      try { completed = await store.completeAnalysis(uid, id, decision.requestId); }
      catch { throw new ReviewRequestError(503, "REVIEW_SAVE_PENDING", "The generated review is saved, but applying it was not confirmed. Check or finish saving this request; another AI call is not needed.", publicReviewRequest(decision.project)); }
      decision = accepted(completed);
    }
    response.json({ project: publicProject(decision.project) });
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
  if (rooms) registerRoomRoutes(app, rooms, notifyRoom);
  if (homes) registerHomeRoutes(app, homes);
  if (homeCollaboration) registerHomeCollaborationRoutes(app, homeCollaboration);
  app.use((_request, _response, next) => next(new AppError(404, "NOT_FOUND", "This endpoint could not be found.")));
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof AppError) { response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error instanceof ReviewRequestError && error.reviewRequest ? { reviewRequest: error.reviewRequest } : {}) } }); return; }
    if (error instanceof ZodError || (error instanceof SyntaxError && "body" in error)) { response.status(422).json({ error: { code: "INVALID_INPUT", message: "Check the supplied fields. Text is required; quantities and prices must be positive whole numbers within the supported limits." } }); return; }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { response.status(413).json({ error: { code: "INPUT_TOO_LARGE", message: "This source text is too long. Please use a shorter excerpt." } }); return; }
    // Never log source text, model content, authorization headers, or raw upstream errors.
    console.error(JSON.stringify({ event: "request_failed", code: "SERVICE_UNAVAILABLE" }));
    response.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "The project service is unavailable. Your change was not confirmed saved. Please reload and retry." } });
  };
  app.use(errors);
  return app;
}
