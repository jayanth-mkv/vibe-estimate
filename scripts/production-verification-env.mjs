import path from "node:path";

const systemKeys = new Map([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME", "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "OS", "LANG", "LC_ALL", "TZ"
].map(key => [key, key === "SYSTEMROOT" ? "SystemRoot" : key]));

const overrideKeys = new Set([
  "VERIFICATION_BASE_URL", "VERIFICATION_RUNTIME", "CONNECTED_FIREBASE_TEST",
  "CONNECTED_FIREBASE_PROJECT_ID", "PRODUCTION_EVIDENCE_DIR",
  "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_NO_COPY_PROMPT", "CI",
  "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"
]);

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const textValue = value => typeof value === "string" && value.length > 0 && !value.includes("\0");
const invalid = () => new Error("Production verification environment overrides are invalid; configuration values are withheld.");

/** Keep browser workers independent of inherited cloud credentials and debug capture. */
export function productionVerificationEnvironment(overrides, inherited = process.env) {
  if (!record(overrides) || !record(inherited)) throw invalid();
  const env = {};
  for (const [key, value] of Object.entries(inherited)) {
    const canonical = systemKeys.get(key.toUpperCase());
    if (canonical && textValue(value) && (!(canonical in env) || key === canonical)) {
      env[canonical] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!overrideKeys.has(key) || !textValue(value)
      || key === "PLAYWRIGHT_NO_COPY_PROMPT" && value !== "1"
      || key === "CI" && value !== "true"
      || key === "VERIFICATION_RUNTIME" && !["production", "connected"].includes(value)
      || key === "CONNECTED_FIREBASE_TEST" && !["0", "1"].includes(value)) throw invalid();
    env[key] = value;
  }
  // These protections cannot be disabled through inherited or explicit settings.
  env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
  env.CI = "true";
  return env;
}

/** Callers must resolve filesystem symlinks before checking these absolute paths. */
export function isExternalEvidencePath(root, candidate, pathImplementation = path) {
  if (!textValue(root) || !textValue(candidate)
    || !pathImplementation.isAbsolute(root) || !pathImplementation.isAbsolute(candidate)) return false;
  const relative = pathImplementation.relative(pathImplementation.resolve(root), pathImplementation.resolve(candidate));
  return relative === ".." || relative.startsWith(".." + pathImplementation.sep) || pathImplementation.isAbsolute(relative);
}
