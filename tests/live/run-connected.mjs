import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeChild, completion } from "../../scripts/processes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
class PreflightError extends Error {}

try {
  // No arbitrary Playwright flags: retries/repetition could spend more than the
  // explicitly bounded two observations. Discovery is safe without cloud access.
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--list")) throw new PreflightError("This bounded runner accepts only the optional --list argument.");
  const discovery = args[0] === "--list";
  const project = process.env.CONNECTED_FIREBASE_PROJECT_ID;
  if (!discovery && (!project || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project.startsWith("demo-"))) {
    throw new PreflightError("Supply the authorized real Firebase project through CONNECTED_FIREBASE_PROJECT_ID.");
  }
  if (!discovery) {
    const response = await fetch("http://127.0.0.1:8080/health", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new PreflightError("The connected backend is unavailable.");
    const health = await response.json();
    if (health.status !== "ok" || health.aiProvider !== "gemini" || health.geminiTransport !== "vertex" ||
        health.auth !== "firebase" || health.storage !== "firestore" || health.storageConnection !== "cloud" || health.runtime !== "connected") {
      throw new PreflightError("Start the explicit connected Firebase + Vertex stack before this verification.");
    }
    const frontend = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(15000) });
    if (!frontend.ok || new URL(frontend.url).origin !== "http://localhost:3000") throw new PreflightError("The connected frontend must be available on localhost:3000.");
  }

  // The browser obtains its anonymous Firebase identity through the product UI.
  // Do not pass cloud credentials, gcloud settings, ADC, or emulator settings to
  // the test worker. Only the explicitly selected project is needed for checks.
  const systemKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => systemKeys.has(key.toUpperCase())));
  Object.assign(env, {
    CI: "true", CONNECTED_FIREBASE_TEST: discovery ? "0" : "1", PLAYWRIGHT_NO_COPY_PROMPT: "1",
    ...(project ? { CONNECTED_FIREBASE_PROJECT_ID: project } : {}),
    PLAYWRIGHT_BROWSERS_PATH: path.join(root, ".cache/playwright"),
    APPDATA: path.join(root, ".cache/config"),
    LOCALAPPDATA: path.join(root, ".cache/local"),
    XDG_CONFIG_HOME: path.join(root, ".cache/config"),
    XDG_CACHE_HOME: path.join(root, ".cache")
  });
  for (const directory of [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME]) fs.mkdirSync(directory, { recursive: true });
  console.log(discovery ? "Discovering the connected room journey without contacting cloud services." : "Connected verification: one guest room journey, two messages, at most two Vertex observations, no retries or credential recordings.");
  await completion(nodeChild("node_modules/@playwright/test/cli.js", ["test", "--config", "tests/live/connected.config.ts", ...args, ...(discovery ? ["--reporter=list"] : [])], env));
} catch (error) {
  // Request errors can carry headers. Never forward raw cloud or browser errors.
  console.error(error instanceof PreflightError ? error.message : "Connected verification did not complete. Check the connected stack and local Playwright report; credentials are not printed.");
  process.exitCode = 1;
}
