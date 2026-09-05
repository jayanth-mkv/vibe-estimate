import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateEnvironmentKeys = new Set([
  "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CREDENTIALS", "GOOGLE_CLOUD_KEYFILE_JSON", "GCLOUD_KEYFILE_JSON",
  "GOOGLE_OAUTH_ACCESS_TOKEN", "TF_VAR_ACCESS_TOKEN", "TF_VAR_GEMINI_API_KEY", "FIREBASE_CONFIG", "FIREBASE_TOKEN",
  "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_TRANSPORT", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI",
  "GOOGLE_GENAI_USE_ENTERPRISE", "CLOUDSDK_CONFIG", "FIRESTORE_DATABASE_ID", "GOOGLE_CLOUD_QUOTA_PROJECT"
]);
export function localEnv(inherited = process.env) {
  const env = { ...inherited };
  const local = {
    APP_ENV: "local",
    AI_PROVIDER: "fixture",
    GCLOUD_PROJECT: "demo-vibeestimate",
    GOOGLE_CLOUD_PROJECT: "demo-vibeestimate",
    FIREBASE_PROJECT_ID: "demo-vibeestimate",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
    FRONTEND_ORIGIN: "http://127.0.0.1:3000",
    PORT: "8080",
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
    NEXT_PUBLIC_AUTH_MODE: "google",
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-vibeestimate",
    NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-vibeestimate.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    NEXT_PUBLIC_API_URL: "",
    BACKEND_ORIGIN: "http://127.0.0.1:8080",
    FIREBASE_EMULATORS_PATH: path.join(root, ".cache/firebase/emulators"),
    PLAYWRIGHT_BROWSERS_PATH: path.join(root, ".cache/playwright"),
    XDG_CONFIG_HOME: path.join(root, ".cache/config"),
    XDG_CACHE_HOME: path.join(root, ".cache"),
    APPDATA: path.join(root, ".cache/config"),
    LOCALAPPDATA: path.join(root, ".cache/local"),
    npm_config_cache: path.join(root, ".cache/npm"),
    NEXT_TELEMETRY_DISABLED: "1",
    FIREBASE_CLI_DISABLE_TELEMETRY: "1",
    CI: "true"
  };
  // Windows child processes treat environment names case-insensitively. Remove
  // aliases before adding local values so inherited credentials or endpoints
  // cannot win subprocess key ordering.
  const localKeys = new Set(Object.keys(local).map(key => key.toUpperCase()));
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase();
    if (normalized.startsWith("CLOUDSDK_AUTH_") || normalized.startsWith("VERTEX_") || normalized.startsWith("CONNECTED_AUTH_") || normalized.startsWith("NEXT_PUBLIC_") ||
        privateEnvironmentKeys.has(normalized) || localKeys.has(normalized)) delete env[key];
  }
  Object.assign(env, local);
  for (const dir of [env.FIREBASE_EMULATORS_PATH, env.PLAYWRIGHT_BROWSERS_PATH, env.XDG_CONFIG_HOME, env.LOCALAPPDATA]) fs.mkdirSync(dir, { recursive: true });
  return env;
}
