import { validateVertexTarget } from "./vertex-config.js";

export type AppConfig = {
  appEnv: "local" | "production";
  aiProvider: "fixture" | "gemini";
  projectId: string;
  firestoreDatabaseId: string;
  frontendOrigin: string;
  port: number;
  geminiApiKey?: string;
  geminiModel?: string;
  geminiTransport?: "developer" | "vertex";
  vertexProjectId?: string;
  vertexLocation?: string;
  vertexGcloudConfiguration?: string;
  vertexGcloudAccount?: string;
  vertexGcloudConfigDir?: string;
  authEmulatorHost?: string;
  firestoreEmulatorHost?: string;
};

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  const appEnv = env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "local");
  if (appEnv !== "local" && appEnv !== "production") throw new Error("APP_ENV must be local or production.");
  const aiProvider = env.AI_PROVIDER ?? (appEnv === "local" ? "fixture" : "gemini");
  if (aiProvider !== "fixture" && aiProvider !== "gemini") throw new Error("AI_PROVIDER must be fixture or gemini.");
  const projectId = env.FIREBASE_PROJECT_ID ?? env.GCLOUD_PROJECT ?? (appEnv === "local" ? "demo-vibeestimate" : "");
  const authEmulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST ?? (appEnv === "local" ? "127.0.0.1:9099" : undefined);
  const firestoreEmulatorHost = env.FIRESTORE_EMULATOR_HOST ?? (appEnv === "local" ? "127.0.0.1:8085" : undefined);
  const frontendOrigin = env.FRONTEND_ORIGIN ?? (appEnv === "local" ? "http://127.0.0.1:3000" : "");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  if (appEnv === "production") {
    if (env.NODE_ENV !== "production" || aiProvider !== "gemini" || authEmulatorHost || firestoreEmulatorHost || projectId.startsWith("demo-") || env.K_SERVICE && env.APP_ENV !== "production") {
      throw new Error("Production requires live authentication, storage, Gemini, and explicit production configuration.");
    }
  } else {
    if (env.K_SERVICE || env.NODE_ENV === "production") throw new Error("Local mode cannot run in a production container.");
    if (!projectId.startsWith("demo-") || !/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(authEmulatorHost ?? "") || !/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(firestoreEmulatorHost ?? "")) {
      throw new Error("Local mode requires a demo- project and loopback Firebase emulators.");
    }
  }
  let origin: URL;
  try { origin = new URL(frontendOrigin); } catch { throw new Error("FRONTEND_ORIGIN must be one valid web origin."); }
  if (origin.origin !== frontendOrigin || !["http:", "https:"].includes(origin.protocol) || (appEnv === "production" && origin.protocol !== "https:")) throw new Error("FRONTEND_ORIGIN must be an exact web origin (HTTPS in production).");
  const geminiTransport = env.GEMINI_TRANSPORT ?? "developer";
  if (geminiTransport !== "developer" && geminiTransport !== "vertex") throw new Error("GEMINI_TRANSPORT must be developer or vertex.");
  if (geminiTransport === "vertex" && (appEnv !== "local" || aiProvider !== "gemini")) throw new Error("Vertex transport is available only for explicitly configured local Gemini reviews.");
  if (aiProvider === "gemini" && (!env.GEMINI_MODEL?.trim() || !/^[A-Za-z0-9._-]+$/.test(env.GEMINI_MODEL.trim()))) throw new Error("Gemini mode requires a valid explicit GEMINI_MODEL; fixture fallback is disabled.");
  if (aiProvider === "gemini" && geminiTransport === "developer" && !env.GEMINI_API_KEY?.trim()) throw new Error("Developer Gemini mode requires GEMINI_API_KEY; fixture fallback is disabled.");
  if (geminiTransport === "vertex" && (env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim())) throw new Error("Local Vertex mode requires explicit user authentication without an API key.");
  const vertex = geminiTransport === "vertex" ? validateVertexTarget({
    projectId: env.VERTEX_PROJECT_ID,
    location: env.VERTEX_LOCATION,
    gcloudConfiguration: env.VERTEX_GCLOUD_CONFIGURATION,
    gcloudAccount: env.VERTEX_GCLOUD_ACCOUNT,
    gcloudConfigDir: env.VERTEX_GCLOUD_CONFIG_DIR
  }) : undefined;
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port.");
  return {
    appEnv, aiProvider, projectId, frontendOrigin, port, authEmulatorHost, firestoreEmulatorHost,
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID ?? "(default)", geminiApiKey: env.GEMINI_API_KEY?.trim(), geminiModel: env.GEMINI_MODEL?.trim(), geminiTransport,
    vertexProjectId: vertex?.projectId, vertexLocation: vertex?.location,
    vertexGcloudConfiguration: vertex?.gcloudConfiguration, vertexGcloudAccount: vertex?.gcloudAccount, vertexGcloudConfigDir: vertex?.gcloudConfigDir
  };
}
