import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { root, localEnv } from "./local-env.mjs";
import { portOpen } from "./processes.mjs";
import { productionVerificationEnvironment } from "./production-verification-env.mjs";

const sourceProject = "demo-vibeestimate-legacy";
const targetProject = "demo-vibeestimate-migration";
const ports = [9299, 9399, 8285, 4412, 4413, 4512, 4513, 9185];
const children = [];
const stages = { freshEmulators: false, sdkTests: false };
let runDirectory;
let stopping = false;
let rejectFailure;
const serviceFailure = new Promise((_, reject) => { rejectFailure = reject; });
serviceFailure.catch(() => {});
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function start(label, relativeScript, args, env, service = false) {
  const log = fs.createWriteStream(path.join(runDirectory, label + ".log"), { flags: "wx" });
  const child = spawn("rtk", ["proxy", process.execPath, path.join(root, relativeScript), ...args], {
    cwd: service ? runDirectory : root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let closeLog;
  const closed = new Promise(resolve => { closeLog = resolve; });
  const finished = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error(label + " could not start; review its isolated log.")));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  finished.catch(() => {});
  children.push({ label, child, finished, closed });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    log.write(chunk);
    if (!service) process.stdout.write(chunk);
  });
  log.on("error", () => rejectFailure(new Error("The isolated fixture log could not be written.")));
  child.once("close", () => log.end(closeLog));
  if (service) finished.then(
    () => { if (!stopping) rejectFailure(new Error(label + " stopped before SDK verification completed.")); },
    error => { if (!stopping) rejectFailure(error); },
  );
  return finished;
}

async function ready() {
  const deadline = Date.now() + 420000;
  let nextNotice = Date.now() + 15000;
  while (Date.now() < deadline && !stopping) {
    if ((await Promise.all([9299, 9399, 8285].map(portOpen))).every(Boolean)) return;
    if (Date.now() >= nextNotice) {
      console.log("Waiting for isolated source Auth, target Auth and Firestore; details stay in fixture logs.");
      nextNotice = Date.now() + 15000;
    }
    await pause(500);
  }
  throw new Error("Isolated migration emulators did not become ready.");
}

async function localJson(url, init = {}) {
  if (!/^http:\/\/127\.0\.0\.1:(9299|9399|8285)\//.test(url)) throw new Error("Unapproved fixture endpoint.");
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Isolated migration fixture metadata was unavailable.");
  return response.json();
}

async function stopOwnedChildren() {
  stopping = true;
  for (const { child } of [...children].reverse()) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // PID came only from this runner's spawn; never enumerate or terminate an
      // existing stack, shared development process or port owner.
      const stopper = spawn("rtk", ["proxy", "taskkill", "/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      await new Promise(resolve => { stopper.once("error", resolve); stopper.once("close", resolve); });
    } else child.kill("SIGTERM");
  }
  await Promise.race([Promise.all(children.map(entry => entry.closed)), pause(10000)]);
}
process.once("SIGINT", () => { process.exitCode = 130; rejectFailure(new Error("Migration fixture verification was interrupted.")); });
process.once("SIGTERM", () => { process.exitCode = 143; rejectFailure(new Error("Migration fixture verification was interrupted.")); });

try {
  if (process.argv.length !== 2 || fs.realpathSync(process.cwd()) !== fs.realpathSync(root)) throw new Error("Run this fixture runner from the repository root without arguments.");
  for (const port of ports) if (await portOpen(port)) throw new Error("Isolated migration port " + port + " is already in use; existing processes are untouched.");
  const cache = path.join(root, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  runDirectory = fs.mkdtempSync(path.join(cache, "firebase-migration-"));
  for (const directory of ["config", "local", "cache", "tmp"]) fs.mkdirSync(path.join(runDirectory, directory));
  const env = {
    ...localEnv(productionVerificationEnvironment({}, process.env)),
    GCLOUD_PROJECT: targetProject, GOOGLE_CLOUD_PROJECT: targetProject, FIREBASE_PROJECT_ID: targetProject,
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9299", FIREBASE_MIGRATION_SOURCE_AUTH_EMULATOR_HOST: "127.0.0.1:9399",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8285",
    APPDATA: path.join(runDirectory, "config"), XDG_CONFIG_HOME: path.join(runDirectory, "config"),
    LOCALAPPDATA: path.join(runDirectory, "local"), XDG_CACHE_HOME: path.join(runDirectory, "cache"),
    TEMP: path.join(runDirectory, "tmp"), TMP: path.join(runDirectory, "tmp"),
  };
  const targetConfig = path.join(runDirectory, "target.firebase.json");
  const sourceConfig = path.join(runDirectory, "source.firebase.json");
  fs.writeFileSync(targetConfig, JSON.stringify({ firestore: { rules: path.join(root, "firestore.rules") }, emulators: {
    auth: { host: "127.0.0.1", port: 9299 }, firestore: { host: "127.0.0.1", port: 8285, websocketPort: 9185 },
    ui: { enabled: false }, hub: { host: "127.0.0.1", port: 4412 }, logging: { host: "127.0.0.1", port: 4512 }, singleProjectMode: false,
  } }), { flag: "wx" });
  fs.writeFileSync(sourceConfig, JSON.stringify({ emulators: {
    auth: { host: "127.0.0.1", port: 9399 }, ui: { enabled: false },
    hub: { host: "127.0.0.1", port: 4413 }, logging: { host: "127.0.0.1", port: 4513 }, singleProjectMode: false,
  } }), { flag: "wx" });
  console.log("Migration SDK verification uses only two demo Auth projects and an isolated Firestore emulator.");
  console.log("Fixture artifacts: " + path.relative(root, runDirectory));
  start("target-emulators", "node_modules/firebase-tools/lib/bin/firebase.js", ["emulators:start", "--only", "auth,firestore", "--project", targetProject,
    "--config", targetConfig, "--non-interactive"], env, true);
  start("source-emulator", "node_modules/firebase-tools/lib/bin/firebase.js", ["emulators:start", "--only", "auth", "--project", sourceProject,
    "--config", sourceConfig, "--non-interactive"], { ...env, GCLOUD_PROJECT: sourceProject, GOOGLE_CLOUD_PROJECT: sourceProject,
    FIREBASE_PROJECT_ID: sourceProject, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9399" }, true);
  await Promise.race([ready(), serviceFailure]);
  for (const [port, project] of [[9299, targetProject], [9399, sourceProject]]) {
    const accounts = await localJson(`http://127.0.0.1:${port}/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`, { headers: { Authorization: "Bearer owner" } });
    if ((accounts.users?.length ?? 0) !== 0) throw new Error("The fresh migration Auth emulator was not empty; no fixture data was changed.");
  }
  const collections = await localJson(`http://127.0.0.1:8285/v1/projects/${targetProject}/databases/(default)/documents:listCollectionIds`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}",
  });
  if ((collections.collectionIds?.length ?? 0) !== 0) throw new Error("The fresh migration Firestore emulator was not empty; no fixture data was changed.");
  stages.freshEmulators = true;
  const result = await Promise.race([start("sdk-tests", "node_modules/vitest/vitest.mjs", ["run", "--config", "tests/firebase-migration-emulator.config.ts"], env), serviceFailure]);
  if (result.code !== 0) throw new Error("Firebase migration SDK tests failed; review the isolated fixture log.");
  stages.sdkTests = true;
  console.log("Migration SDK verification passed against fresh isolated emulators.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration fixture verification did not complete.");
  process.exitCode ??= 1;
} finally {
  await stopOwnedChildren();
  if (runDirectory) fs.writeFileSync(path.join(runDirectory, "verification.json"), JSON.stringify({
    finishedAt: new Date().toISOString(), sourceProject, targetProject, ports, stages,
    importedWorkspace: false, exitCode: process.exitCode ?? 0,
    ownedProcesses: children.map(({ label, child }) => ({ label, pid: child.pid ?? null })),
  }, null, 2), { flag: "wx" });
}
