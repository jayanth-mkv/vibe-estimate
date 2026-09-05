import fs from "node:fs";
import path from "node:path";
import { geminiBackendEnv, outsideRepository } from "./gemini-config.mjs";
import { localEnv } from "./local-env.mjs";

const frontendOrigin = "http://localhost:3000";
const settingsKeys = new Set(["firebaseProjectId", "firestoreDatabaseId", "webConfigPath", "gcloudConfiguration", "account", "gcloudConfigDir", "authProjectId", "geminiConfigPath", "frontendOrigin"]);
const sdkKeys = new Set(["apiKey", "authDomain", "projectId", "appId", "storageBucket", "messagingSenderId", "measurementId", "databaseURL"]);
const systemKeys = new Map([
  "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "OS", "TERM", "COLORTERM", "NO_COLOR", "FORCE_COLOR"
].map(key => [key, key === "SYSTEMROOT" ? "SystemRoot" : key]));
const validProject = value => typeof value === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value) && !value.startsWith("demo-");
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const invalid = () => new Error("The private connected configuration is incomplete or inconsistent. Its values have not been displayed.");

function external(filename, relativeTo, kind = "file") {
  const resolved = outsideRepository(filename, relativeTo);
  try {
    const stat = fs.statSync(resolved);
    if (kind === "file" ? !stat.isFile() || stat.size > 65536 : !stat.isDirectory()) throw invalid();
  } catch { throw invalid(); }
  return resolved;
}
function readPrivateJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, "utf8")); }
  catch { throw invalid(); }
}
function settingsFrom(configPath) {
  const filename = external(configPath, process.cwd());
  const settings = readPrivateJson(filename);
  if (!plain(settings) || Object.keys(settings).some(key => !settingsKeys.has(key)) || settingsKeys.size !== Object.keys(settings).length
    || !validProject(settings.firebaseProjectId) || !validProject(settings.authProjectId)
    || typeof settings.firestoreDatabaseId !== "string" || settings.firestoreDatabaseId !== "(default)" && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(settings.firestoreDatabaseId)
    || settings.frontendOrigin !== frontendOrigin
    || typeof settings.gcloudConfiguration !== "string" || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(settings.gcloudConfiguration)
    || typeof settings.account !== "string" || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(settings.account) || /\.gserviceaccount\.com$/i.test(settings.account)) throw invalid();
  return {
    ...settings,
    webConfigPath: external(settings.webConfigPath, path.dirname(filename)),
    geminiConfigPath: external(settings.geminiConfigPath, path.dirname(filename)),
    gcloudConfigDir: external(settings.gcloudConfigDir, path.dirname(filename), "directory")
  };
}
function webSettings(settings) {
  const web = readPrivateJson(settings.webConfigPath);
  if (!plain(web) || Object.keys(web).some(key => !sdkKeys.has(key)) || web.projectId !== settings.firebaseProjectId
    || typeof web.apiKey !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(web.apiKey)
    || web.authDomain !== settings.firebaseProjectId + ".firebaseapp.com"
    || typeof web.appId !== "string" || !/^1:\d+:web:[A-Za-z0-9]+$/.test(web.appId)) throw invalid();
  if (web.storageBucket !== undefined && ![settings.firebaseProjectId + ".appspot.com", settings.firebaseProjectId + ".firebasestorage.app"].includes(web.storageBucket)) throw invalid();
  if (web.messagingSenderId !== undefined && (typeof web.messagingSenderId !== "string" || !/^\d+$/.test(web.messagingSenderId) || web.appId.split(":")[1] !== web.messagingSenderId)) throw invalid();
  if (web.measurementId !== undefined && (typeof web.measurementId !== "string" || !/^G-[A-Z0-9]+$/.test(web.measurementId))) throw invalid();
  if (web.databaseURL !== undefined) {
    let url;
    try { url = new URL(web.databaseURL); } catch { throw invalid(); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["/", ""].includes(url.pathname) || url.search || url.hash
      || ![`${settings.firebaseProjectId}.firebaseio.com`, `${settings.firebaseProjectId}-default-rtdb.firebaseio.com`].includes(url.hostname)) throw invalid();
  }
  return web;
}

function runtimeBase(inherited) {
  if (!plain(inherited) || Object.keys(inherited).some(key => key.toUpperCase() === "K_SERVICE" && inherited[key] !== undefined || key.toUpperCase() === "NODE_ENV" && inherited[key] === "production")) {
    throw new Error("The connected launcher is restricted to a non-production local process.");
  }
  const system = {};
  for (const [key, value] of Object.entries(inherited)) {
    const canonical = systemKeys.get(key.toUpperCase());
    if (canonical && typeof value === "string") system[canonical] = value;
  }
  const base = localEnv(system);
  for (const key of Object.keys(base)) {
    if (/^(?:NEXT_PUBLIC_|FIREBASE_|FIRESTORE_|GOOGLE_|GCLOUD_|GEMINI_|VERTEX_|CONNECTED_AUTH_|CLOUDSDK_)/.test(key.toUpperCase()) || ["APP_ENV", "AI_PROVIDER", "FRONTEND_ORIGIN", "PORT"].includes(key.toUpperCase())) delete base[key];
  }
  return { ...base, NODE_ENV: "development" };
}

/** Builds isolated child environments. Do not log these objects: the backend includes private profile configuration. */
export function connectedEnvironments(configPath, inheritedEnv = process.env) {
  const base = runtimeBase(inheritedEnv);
  const settings = settingsFrom(configPath);
  const web = webSettings(settings);
  const backendBase = {
    ...base, APP_ENV: "connected", AI_PROVIDER: "gemini", FIREBASE_PROJECT_ID: settings.firebaseProjectId,
    FIRESTORE_DATABASE_ID: settings.firestoreDatabaseId, FRONTEND_ORIGIN: frontendOrigin, PORT: "8080",
    CONNECTED_AUTH_PROJECT_ID: settings.authProjectId, CONNECTED_AUTH_GCLOUD_CONFIGURATION: settings.gcloudConfiguration,
    CONNECTED_AUTH_GCLOUD_ACCOUNT: settings.account, CONNECTED_AUTH_GCLOUD_CONFIG_DIR: settings.gcloudConfigDir
  };
  const backendEnv = geminiBackendEnv(backendBase, settings.geminiConfigPath);
  if (backendEnv.GEMINI_TRANSPORT !== "vertex" || backendEnv.VERTEX_PROJECT_ID !== settings.authProjectId
    || backendEnv.VERTEX_GCLOUD_CONFIGURATION !== settings.gcloudConfiguration || backendEnv.VERTEX_GCLOUD_ACCOUNT !== settings.account
    || backendEnv.VERTEX_GCLOUD_CONFIG_DIR !== settings.gcloudConfigDir) throw invalid();
  const frontendEnv = {
    ...base, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false", NEXT_PUBLIC_AUTH_MODE: "guest", NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: web.projectId, NEXT_PUBLIC_FIREBASE_API_KEY: web.apiKey,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: web.authDomain, NEXT_PUBLIC_FIREBASE_APP_ID: web.appId,
    NEXT_PUBLIC_API_URL: "", BACKEND_ORIGIN: "http://127.0.0.1:8080"
  };
  for (const [field, key] of [["storageBucket", "STORAGE_BUCKET"], ["messagingSenderId", "MESSAGING_SENDER_ID"], ["measurementId", "MEASUREMENT_ID"], ["databaseURL", "DATABASE_URL"]]) {
    if (web[field] !== undefined) frontendEnv["NEXT_PUBLIC_FIREBASE_" + key] = web[field];
  }
  return { backendEnv, frontendEnv, frontendOrigin };
}

export function connectedConfigArgument(args) {
  if (!Array.isArray(args) || args.length !== 2 || args[0] !== "--config" || typeof args[1] !== "string" || !args[1].trim()) {
    throw new Error("Usage: npm run dev:connected -- --config <private JSON file outside this repository>");
  }
  return args[1];
}
