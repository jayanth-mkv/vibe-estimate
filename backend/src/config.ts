import { validateNamedGcloudTarget, validateVertexTarget } from "./vertex-config.js";

export type AppConfig = {
  appEnv: "local" | "connected" | "production";
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
  vertexAuthMode?: "named-profile" | "runtime";
  taskQueuePath?: string;
  taskServiceAccount?: string;
  authEmulatorHost?: string;
  firestoreEmulatorHost?: string;
  connectedAuthProjectId?: string;
  connectedAuthGcloudConfiguration?: string;
  connectedAuthGcloudAccount?: string;
  connectedAuthGcloudConfigDir?: string;
};

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  const appEnv = env.APP_ENV ?? (env.NODE_ENV === "production" ? "production" : "local");
  if (appEnv !== "local" && appEnv !== "connected" && appEnv !== "production") throw new Error("APP_ENV must be local, connected or production.");
  const aiProvider = env.AI_PROVIDER ?? (appEnv === "local" ? "fixture" : "gemini");
  if (aiProvider !== "fixture" && aiProvider !== "gemini") throw new Error("AI_PROVIDER must be fixture or gemini.");
  const projectId = env.FIREBASE_PROJECT_ID ?? (appEnv === "connected" ? "" : env.GCLOUD_PROJECT ?? (appEnv === "local" ? "demo-vibeestimate" : ""));
  const authEmulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST ?? (appEnv === "local" ? "127.0.0.1:9099" : undefined);
  const firestoreEmulatorHost = env.FIRESTORE_EMULATOR_HOST ?? (appEnv === "local" ? "127.0.0.1:8085" : undefined);
  const frontendOrigin = env.FRONTEND_ORIGIN ?? (appEnv === "local" ? "http://127.0.0.1:3000" : "");
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  if (appEnv === "production") {
    if (env.NODE_ENV !== "production" || aiProvider !== "gemini" || authEmulatorHost || firestoreEmulatorHost || projectId.startsWith("demo-") || env.K_SERVICE && env.APP_ENV !== "production") {
      throw new Error("Production requires live authentication, storage, Gemini, and explicit production configuration.");
    }
  } else if (appEnv === "connected") {
    const forbiddenRuntimeKeys = new Set(["K_SERVICE", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]);
    if (env.NODE_ENV === "production" || aiProvider !== "gemini" || projectId.startsWith("demo-") || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
      || Object.keys(env).some(key => forbiddenRuntimeKeys.has(key.toUpperCase()) && env[key] !== undefined)) {
      throw new Error("Connected mode requires explicit live Firebase and Gemini, no emulator variables, and a non-production local process.");
    }
    const credentialOverrides = new Set(["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CREDENTIALS", "GOOGLE_CLOUD_KEYFILE_JSON", "GCLOUD_KEYFILE_JSON", "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_API_KEY"]);
    if (Object.keys(env).some(key => (credentialOverrides.has(key.toUpperCase()) || key.toUpperCase().startsWith("CLOUDSDK_AUTH_")) && Boolean(env[key]?.trim()))) {
      throw new Error("Connected mode requires its explicitly verified named-profile authentication without credential overrides.");
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
  if (appEnv === "connected" && (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname))) throw new Error("Connected mode requires a loopback HTTP frontend origin.");
  const geminiTransport = env.GEMINI_TRANSPORT ?? "developer";
  if (geminiTransport !== "developer" && geminiTransport !== "vertex") throw new Error("GEMINI_TRANSPORT must be developer or vertex.");
  if (geminiTransport === "vertex" && aiProvider !== "gemini") throw new Error("Vertex transport requires Gemini reviews.");
  if (aiProvider === "gemini" && (!env.GEMINI_MODEL?.trim() || !/^[A-Za-z0-9._-]+$/.test(env.GEMINI_MODEL.trim()))) throw new Error("Gemini mode requires a valid explicit GEMINI_MODEL; fixture fallback is disabled.");
  if (aiProvider === "gemini" && geminiTransport === "developer" && !env.GEMINI_API_KEY?.trim()) throw new Error("Developer Gemini mode requires GEMINI_API_KEY; fixture fallback is disabled.");
  if (geminiTransport === "vertex" && (env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim())) throw new Error("Local Vertex mode requires explicit user authentication without an API key.");
  const runtimeVertex = geminiTransport === "vertex" && appEnv === "production";
  if (runtimeVertex && (env.VERTEX_AUTH_MODE !== "runtime" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.VERTEX_PROJECT_ID ?? "") || !/^(global|[a-z]+-[a-z]+[0-9])$/.test(env.VERTEX_LOCATION ?? "")
    || Object.keys(env).some(key => /^(?:VERTEX_GCLOUD_|CONNECTED_AUTH_|CLOUDSDK_AUTH_)/i.test(key) || /^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CREDENTIALS|GOOGLE_OAUTH_ACCESS_TOKEN)$/i.test(key) && Boolean(env[key])))) {
    throw new Error("Production Vertex requires an explicit runtime identity and target; local credentials are forbidden.");
  }
  const vertex = geminiTransport === "vertex" && !runtimeVertex ? validateVertexTarget({
    projectId: env.VERTEX_PROJECT_ID,
    location: env.VERTEX_LOCATION,
    gcloudConfiguration: env.VERTEX_GCLOUD_CONFIGURATION,
    gcloudAccount: env.VERTEX_GCLOUD_ACCOUNT,
    gcloudConfigDir: env.VERTEX_GCLOUD_CONFIG_DIR
  }) : undefined;
  const connected = appEnv === "connected" ? validateNamedGcloudTarget({
    projectId: env.CONNECTED_AUTH_PROJECT_ID,
    gcloudConfiguration: env.CONNECTED_AUTH_GCLOUD_CONFIGURATION,
    gcloudAccount: env.CONNECTED_AUTH_GCLOUD_ACCOUNT,
    gcloudConfigDir: env.CONNECTED_AUTH_GCLOUD_CONFIG_DIR
  }) : undefined;
  const firestoreDatabaseId = env.FIRESTORE_DATABASE_ID ?? (appEnv === "connected" ? "" : "(default)");
  if (firestoreDatabaseId !== "(default)" && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(firestoreDatabaseId)) throw new Error("FIRESTORE_DATABASE_ID must identify an explicit valid database.");
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port.");
  const taskQueuePath = env.ROOM_TASK_QUEUE;
  const taskServiceAccount = env.ROOM_TASK_SERVICE_ACCOUNT;
  if (appEnv === "production" && (!/^projects\/[a-z][a-z0-9-]+\/locations\/[a-z]+-[a-z]+[0-9]\/queues\/[a-z][a-z0-9-]+$/.test(taskQueuePath ?? "") || !/^[a-z][a-z0-9-]+@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(taskServiceAccount ?? ""))) throw new Error("Production requires a managed room task queue and delivery identity.");
  return {
    appEnv, aiProvider, projectId, frontendOrigin, port, authEmulatorHost, firestoreEmulatorHost,
    firestoreDatabaseId, geminiApiKey: env.GEMINI_API_KEY?.trim(), geminiModel: env.GEMINI_MODEL?.trim(), geminiTransport,
    vertexProjectId: runtimeVertex ? env.VERTEX_PROJECT_ID : vertex?.projectId, vertexLocation: runtimeVertex ? env.VERTEX_LOCATION : vertex?.location,
    vertexAuthMode: runtimeVertex ? "runtime" : "named-profile", taskQueuePath, taskServiceAccount,
    vertexGcloudConfiguration: vertex?.gcloudConfiguration, vertexGcloudAccount: vertex?.gcloudAccount, vertexGcloudConfigDir: vertex?.gcloudConfigDir,
    connectedAuthProjectId: connected?.projectId, connectedAuthGcloudConfiguration: connected?.gcloudConfiguration,
    connectedAuthGcloudAccount: connected?.gcloudAccount, connectedAuthGcloudConfigDir: connected?.gcloudConfigDir
  };
}
