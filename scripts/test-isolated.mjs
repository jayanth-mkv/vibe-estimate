import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { localEnv, root } from "./local-env.mjs";
import { portOpen, stopChild } from "./processes.mjs";
import { productionVerificationEnvironment } from "./production-verification-env.mjs";

const appOrigin = "http://127.0.0.1:3102";
const apiOrigin = "http://127.0.0.1:8180";
const projectId = "demo-vibeestimate";
const ports = [3102, 8180, 9099, 8085, 4402, 4502, 9152];
const children = [];
let stopping = false;
let interruptedCode;
let runDirectory;
let rejectServiceFailure;
const serviceFailure = new Promise((_, reject) => { rejectServiceFailure = reject; });
serviceFailure.catch(() => {});
const stages = { freshEmulators: false, fixtureBackend: false, fixtureGateway: false, rules: false, playwright: false };
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));

function argumentsFor(args) {
  if (!args.length) return [];
  if (args.length === 2 && args[0] === "--grep" && args[1].trim() && !args[1].startsWith("--")) return args;
  throw new Error("Usage: node scripts/test-isolated.mjs [--grep <test pattern>].");
}

function start(label, script, args, cwd, env, service = false) {
  const log = fs.createWriteStream(path.join(runDirectory, "logs", label + ".log"), { flags: "a" });
  const child = spawn("rtk", ["proxy", process.execPath, path.join(root, script), ...args], {
    cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  let closeLog;
  const closed = new Promise(resolve => { closeLog = resolve; });
  const finished = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error(label + " could not start. Check its isolated log.")));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  finished.catch(() => {});
  children.push({ label, child, finished, closed });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    log.write(chunk);
    if (!service) process.stdout.write(chunk);
  });
  log.on("error", () => rejectServiceFailure(new Error("The isolated verification log could not be written.")));
  child.once("close", () => log.end(closeLog));
  if (service) finished.then(
    () => { if (!stopping) rejectServiceFailure(new Error(label + " stopped before verification finished. Check its isolated log.")); },
    error => { if (!stopping) rejectServiceFailure(error); }
  );
  return finished;
}

async function waitUntil(label, check, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let nextNotice = Date.now() + 15000;
  while (!stopping && Date.now() < deadline) {
    try { if (await check()) return; } catch { /* Startup failures are retried within the deadline. */ }
    if (Date.now() >= nextNotice) {
      console.log("Waiting for " + label + "; details remain in the isolated logs.");
      nextNotice = Date.now() + 15000;
    }
    await pause(500);
  }
  throw new Error("Timed out waiting for " + label + ". Check the isolated logs.");
}

async function localJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("An isolated emulator or fixture endpoint is not ready.");
  return response.json();
}

function fixtureHealth(health) {
  return health.status === "ok" && health.runtime === "local" && health.aiProvider === "fixture"
    && health.auth === "emulator" && health.storage === "firestore" && health.storageConnection === "emulator";
}

async function runCheck(label, script, args, env) {
  const result = await Promise.race([start(label, script, args, root, env), serviceFailure]);
  if (result.code !== 0) throw new Error(label + " failed. Review the isolated report and logs.");
}

async function stopOwnedChildren() {
  stopping = true;
  for (const entry of [...children].reverse()) stopChild(entry.child);
  await Promise.race([Promise.all(children.map(entry => entry.closed)), pause(10000)]);
}

function interrupt(code) {
  interruptedCode = code;
  rejectServiceFailure(new Error("Isolated verification was interrupted."));
}
process.once("SIGINT", () => interrupt(130));
process.once("SIGTERM", () => interrupt(143));

try {
  const testArgs = argumentsFor(process.argv.slice(2));
  for (const port of ports) {
    if (await portOpen(port)) throw new Error("Required isolated port " + port + " is already in use. No existing process will be stopped.");
  }
  const parent = path.join(root, ".cache", "fixture-verification");
  fs.mkdirSync(parent, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  runDirectory = fs.mkdtempSync(path.join(parent, stamp + "-"));
  const frontend = path.join(runDirectory, "frontend");
  for (const directory of [frontend, "logs", "firebase", "config", "local", "cache", "tmp", "evidence"]) {
    fs.mkdirSync(path.isAbsolute(directory) ? directory : path.join(runDirectory, directory), { recursive: true });
  }

  // Copy only application sources, assets and required build configuration.
  // Existing .next output, credentials, environment files and user snapshots are excluded.
  for (const directory of ["src", "public"]) {
    fs.cpSync(path.join(root, "frontend", directory), path.join(frontend, directory), { recursive: true, errorOnExist: true, force: false });
  }
  for (const file of ["package.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs"]) {
    fs.copyFileSync(path.join(root, "frontend", file), path.join(frontend, file), fs.constants.COPYFILE_EXCL);
  }
  fs.copyFileSync(path.join(root, "frontend", "next.config.ts"), path.join(frontend, "next.config.fixture-source.ts"), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(frontend, "next.config.ts"),
    'import config from "./next.config.fixture-source";\nexport default { ...config, turbopack: { ...config.turbopack, root: ' + JSON.stringify(root) + ' } };\n', { flag: "wx" });

  // Only OS essentials survive into localEnv; no connected profile, ADC,
  // credential, debug or public runtime configuration is inherited.
  const env = {
    ...localEnv(productionVerificationEnvironment({}, process.env)),
    FRONTEND_ORIGIN: appOrigin, PORT: "8180", BACKEND_ORIGIN: apiOrigin, NEXT_PUBLIC_API_URL: "",
    VIBEESTIMATE_E2E_API_ORIGIN: apiOrigin, VIBEESTIMATE_E2E_BASE_URL: appOrigin,
    APPDATA: path.join(runDirectory, "config"), XDG_CONFIG_HOME: path.join(runDirectory, "config"),
    LOCALAPPDATA: path.join(runDirectory, "local"), XDG_CACHE_HOME: path.join(runDirectory, "cache"),
    TEMP: path.join(runDirectory, "tmp"), TMP: path.join(runDirectory, "tmp"),
    PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(runDirectory, "evidence", "html"), PLAYWRIGHT_HTML_OPEN: "never"
  };
  const firebaseConfig = path.join(runDirectory, "firebase.json");
  fs.writeFileSync(firebaseConfig, JSON.stringify({
    firestore: { rules: path.join(root, "firestore.rules") },
    emulators: {
      auth: { host: "127.0.0.1", port: 9099 },
      firestore: { host: "127.0.0.1", port: 8085, websocketPort: 9152 },
      ui: { enabled: false }, hub: { host: "127.0.0.1", port: 4402 },
      logging: { host: "127.0.0.1", port: 4502 }, singleProjectMode: true
    }
  }, null, 2), { flag: "wx" });
  console.log("Isolated fixture verification: " + appOrigin + " → " + apiOrigin + ". Connected ports 3000 and 8080 are untouched.");
  console.log("Run artifacts: " + path.relative(root, runDirectory));
  start("emulators", "node_modules/firebase-tools/lib/bin/firebase.js", [
    "emulators:start", "--only", "auth,firestore", "--project", projectId,
    "--config", firebaseConfig, "--non-interactive"
  ], path.join(runDirectory, "firebase"), env, true);
  await Promise.race([waitUntil("fresh Firebase emulators", async () => (await portOpen(9099)) && (await portOpen(8085)), 300000), serviceFailure]);
  const accounts = await localJson("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/" + projectId + "/accounts:batchGet?maxResults=-1", { headers: { Authorization: "Bearer owner" } });
  const collections = await localJson("http://127.0.0.1:8085/v1/projects/" + projectId + "/databases/(default)/documents:listCollectionIds", {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}"
  });
  if ((accounts.users?.length ?? 0) !== 0 || (collections.collectionIds?.length ?? 0) !== 0) throw new Error("The isolated emulators were not empty; verification is stopped without changing their data.");
  stages.freshEmulators = true;
  console.log("Verified empty demo Auth and Firestore; no workspace was imported.");

  start("backend", "node_modules/tsx/dist/cli.mjs", ["src/index.ts"], path.join(root, "backend"), env, true);
  await Promise.race([waitUntil("fixture backend", async () => fixtureHealth(await localJson(apiOrigin + "/health"))), serviceFailure]);
  stages.fixtureBackend = true;
  start("frontend", "node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1", "--port", "3102"], frontend, env, true);
  await Promise.race([waitUntil("isolated frontend gateway", async () => fixtureHealth(await localJson(appOrigin + "/health"))), serviceFailure]);
  await Promise.race([waitUntil("isolated workspace", async () => {
    const response = await fetch(appOrigin + "/", { signal: AbortSignal.timeout(15000) });
    return response.ok && new URL(response.url).origin === appOrigin;
  }), serviceFailure]);
  stages.fixtureGateway = true;
  console.log("Fixture API and frontend gateway verified. Running rules, then browser regression.");
  await runCheck("rules", "node_modules/vitest/vitest.mjs", ["run", "--config", "vitest.rules.config.ts"], env);
  stages.rules = true;
  await runCheck("playwright", "node_modules/@playwright/test/cli.js", [
    "test", "--config", "playwright.config.ts", "--timeout", "90000", "--output", path.join(runDirectory, "evidence", "results"), ...testArgs
  ], env);
  stages.playwright = true;
  console.log("Isolated rules and fixture browser checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Isolated fixture verification did not complete.");
  process.exitCode = interruptedCode ?? 1;
} finally {
  await stopOwnedChildren();
  if (runDirectory) {
    fs.writeFileSync(path.join(runDirectory, "verification.json"), JSON.stringify({
      finishedAt: new Date().toISOString(), appOrigin, apiOrigin, projectId, ports, stages,
      importedWorkspace: false, exitCode: process.exitCode ?? 0,
      processes: children.map(({ label, child }) => ({ label, pid: child.pid ?? null }))
    }, null, 2));
  }
}
