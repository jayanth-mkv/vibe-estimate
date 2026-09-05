import fs from "node:fs";
import path from "node:path";
import { root } from "./local-env.mjs";

function outsideRepository(filename) {
  const resolved = fs.realpathSync(path.resolve(filename));
  const relative = path.relative(fs.realpathSync(root), resolved);
  if (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
    throw new Error("Gemini credentials must stay outside the public repository.");
  }
  return resolved;
}

export function geminiBackendEnv(env, configPath) {
  const privatePath = outsideRepository(configPath);
  let settings;
  try { settings = JSON.parse(fs.readFileSync(privatePath, "utf8")); }
  catch { throw new Error("The private Gemini configuration must contain valid JSON. Its contents have not been logged."); }
  if (settings?.transport === "vertex") {
    const validString = (value, pattern) => typeof value === "string" && pattern.test(value);
    if (env.APP_ENV !== "local" || settings.apiKey != null ||
      !validString(settings.model, /^[a-zA-Z0-9._-]+$/) ||
      !validString(settings.projectId, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/) || settings.projectId.startsWith("demo-") ||
      !validString(settings.location, /^(?:global|[a-z]+-[a-z]+\d+)$/) ||
      !validString(settings.gcloudConfiguration, /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/) ||
      !validString(settings.account, /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/) ||
      typeof settings.gcloudConfigDir !== "string" || !path.isAbsolute(settings.gcloudConfigDir)) {
      throw new Error("Local Vertex configuration requires an explicit valid model, project, location, profile, account and configuration directory, without an API key.");
    }
    let configurationDirectory;
    try {
      configurationDirectory = outsideRepository(settings.gcloudConfigDir);
      if (!fs.statSync(configurationDirectory).isDirectory()) throw new Error();
    } catch { throw new Error("The authorized gcloud configuration directory must exist outside the public repository."); }
    const backend = {
      ...env, AI_PROVIDER: "gemini", GEMINI_TRANSPORT: "vertex", GEMINI_MODEL: settings.model,
      VERTEX_PROJECT_ID: settings.projectId, VERTEX_LOCATION: settings.location,
      VERTEX_GCLOUD_CONFIGURATION: settings.gcloudConfiguration, VERTEX_GCLOUD_ACCOUNT: settings.account,
      VERTEX_GCLOUD_CONFIG_DIR: configurationDirectory
    };
    delete backend.GEMINI_API_KEY;
    delete backend.GOOGLE_API_KEY;
    return backend;
  }
  if (settings?.transport != null && settings.transport !== "developer") throw new Error("The private Gemini transport must be developer or vertex.");
  if (!settings || typeof settings.apiKey !== "string" || !settings.apiKey.trim() || typeof settings.model !== "string" || !/^[a-zA-Z0-9._-]+$/.test(settings.model.trim())) {
    throw new Error("Private Gemini JSON requires a nonempty apiKey and a valid model ID.");
  }
  return { ...env, AI_PROVIDER: "gemini", GEMINI_TRANSPORT: "developer", GEMINI_API_KEY: settings.apiKey.trim(), GEMINI_MODEL: settings.model.trim() };
}
