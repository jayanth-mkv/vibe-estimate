import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { localEnv, root } from "./local-env.mjs";
import { nodeChild, completion } from "./processes.mjs";
import { authValidityState, planAuthValidityRestore } from "./emulator-auth-continuity.mjs";

const PROJECT = "demo-vibeestimate";
const stateRoot = path.join(root, ".cache", "firebase");
const workspace = path.join(stateRoot, "workspace");
const markerName = "vibeestimate-workspace.json";
const metadataName = "firebase-export-metadata.json";
const require = createRequire(import.meta.url);

function localPath(filename) {
  const resolved = path.resolve(filename);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith(".cache" + path.sep) || path.isAbsolute(relative)) throw new Error("Emulator state must remain in this repository's fixed cache.");
  let cursor = resolved;
  while (true) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error("Linked emulator-state paths are not supported.");
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return resolved;
}

function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(localPath(filename), "utf8")); }
  catch { throw new Error("Local emulator metadata could not be verified; file contents omitted."); }
}

function files(directory = workspace, relative = "") {
  const found = [];
  for (const entry of fs.readdirSync(localPath(path.join(directory, relative)), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    const filename = localPath(path.join(directory, name));
    if (entry.isSymbolicLink()) throw new Error("Linked emulator export entries are not supported.");
    if (entry.isDirectory()) found.push(...files(directory, name));
    else if (entry.isFile() && name !== markerName) found.push({
      name: name.split(path.sep).join("/"), size: fs.statSync(filename).size,
      digest: createHash("sha256").update(fs.readFileSync(filename)).digest("hex")
    });
    else if (!entry.isFile()) throw new Error("An emulator export contains an unsupported entry.");
  }
  return found.sort((left, right) => left.name.localeCompare(right.name));
}

function verifyExportFiles() {
  const metadata = readJson(path.join(workspace, metadataName));
  if (!metadata.version || metadata.auth?.path !== "auth_export" || metadata.firestore?.path !== "firestore_export" ||
      metadata.firestore?.metadata_file !== "firestore_export/firestore_export.overall_export_metadata" ||
      Object.keys(metadata).some(key => !["version", "auth", "firestore"].includes(key))) {
    throw new Error("Only the fixed Auth and Firestore emulator export format may be imported.");
  }
  const inventory = files();
  for (const required of [metadataName, "auth_export/accounts.json", "auth_export/config.json", metadata.firestore.metadata_file]) {
    if (!inventory.some(file => file.name === required && file.size > 0)) throw new Error("The local Auth/Firestore export is incomplete.");
  }
  return inventory;
}

export function verifyEmulatorWorkspace() {
  localPath(workspace);
  if (!fs.existsSync(workspace)) return null;
  const marker = readJson(path.join(workspace, markerName));
  const inventory = verifyExportFiles();
  if (![1, 2, 3].includes(marker.version) || marker.projectId !== PROJECT || !marker.liveState ||
      JSON.stringify(marker.files) !== JSON.stringify(inventory)) {
    throw new Error("The saved local workspace does not match its verified demo-project export.");
  }
  return marker;
}

export function emulatorImportArgs() {
  return verifyEmulatorWorkspace() ? ["--import", workspace] : [];
}

async function localJson(url, admin = false, body) {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !["4400", "9099", "8085"].includes(target.port)) throw new Error("Only fixed loopback emulator endpoints are allowed.");
  const response = await fetch(target, {
    method: body ? "POST" : "GET",
    headers: { ...(admin ? { Authorization: "Bearer owner" } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("The local emulator verification request failed; payload omitted.");
  return response.json();
}

async function verifyLocalHub() {
  // Read the same fixed demo-project locator that the CLI will use. Reject
  // remote origins before allowing its export command to contact the hub.
  const { EmulatorHub } = require("../node_modules/firebase-tools/lib/emulator/hub.js");
  const locator = EmulatorHub.readLocatorFile(PROJECT);
  if (!locator?.origins?.length || locator.origins.some(origin => origin !== "http://127.0.0.1:4400")) throw new Error("The fixed demo-project emulator hub is not available on loopback.");
  const emulators = await localJson("http://127.0.0.1:4400/emulators");
  if (emulators.auth?.host !== "127.0.0.1" || emulators.auth.port !== 9099 || emulators.firestore?.host !== "127.0.0.1" || emulators.firestore.port !== 8085) throw new Error("The local emulator endpoints do not match this repository's configuration.");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

async function liveState(includeRooms = true, includeAuthValidity = true) {
  await verifyLocalHub();
  const accounts = await localJson(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=-1`, true);
  const users = (accounts.users ?? []).map(user => ({
    id: user.localId, email: user.email ?? "", disabled: Boolean(user.disabled),
    passwordHash: user.passwordHash ?? "", salt: user.salt ?? ""
  })).sort((left, right) => left.id.localeCompare(right.id));
  // App projects live below users/{uid}/projects. A collection-group query
  // verifies every owner's projects, including records without a parent doc.
  const query = await localJson(`http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, true, {
    structuredQuery: { from: [{ collectionId: "projects", allDescendants: true }], limit: 10001 }
  });
  const documents = query.filter(entry => entry.document).map(({ document }) => ({ name: document.name, fields: document.fields }));
  if (documents.length > 10000) throw new Error("The local verification document limit was reached.");
  documents.sort((left, right) => left.name.localeCompare(right.name));
  const state = { authUsers: users.length, projects: documents.length, authDigest: fingerprint(users), projectDigest: fingerprint(documents) };
  if (includeAuthValidity) state.authValidityDigest = fingerprint(authValidityState(accounts.users ?? []));
  if (includeRooms) {
    for (const collectionId of ["rooms", "roomOwners"]) {
      const result = await localJson(`http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, true, {
        structuredQuery: { from: [{ collectionId, allDescendants: true }], limit: 10001 }
      });
      const records = result.filter(entry => entry.document).map(({ document }) => ({ name: document.name, fields: document.fields }));
      if (records.length > 10000) throw new Error("The local room verification limit was reached.");
      records.sort((left, right) => left.name.localeCompare(right.name));
      state[collectionId] = records.length;
      state[collectionId + "Digest"] = fingerprint(records);
    }
  }
  return state;
}

export async function exportEmulatorWorkspace() {
  localPath(workspace);
  fs.mkdirSync(localPath(stateRoot), { recursive: true });
  const previous = verifyEmulatorWorkspace();
  if (previous) {
    const backup = localPath(path.join(stateRoot, "workspace-backups", new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID()));
    fs.cpSync(workspace, backup, { recursive: true, errorOnExist: true, force: false });
  }
  const before = await liveState();
  // The CLI only exports the demo project's currently running local services.
  // Suppress its output because failed export diagnostics may contain payloads.
  await completion(nodeChild("node_modules/firebase-tools/lib/bin/firebase.js", [
    "emulators:export", workspace, "--only", "auth,firestore", "--project", PROJECT,
    "--config", path.join(root, "firebase.json"), "--force", "--non-interactive"
  ], localEnv(), root, "ignore"));
  const inventory = verifyExportFiles();
  const after = await liveState();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Local data changed during export. Export again before stopping the stack.");
  const marker = { version: 3, projectId: PROJECT, exportedAtUtc: new Date().toISOString(), liveState: after, files: inventory };
  fs.writeFileSync(localPath(path.join(workspace, markerName)), JSON.stringify(marker, null, 2) + "\n", { flag: "wx" });
  verifyEmulatorWorkspace();
  return { status: "export_verified", projectId: PROJECT, files: inventory.length, authUsers: after.authUsers, projects: after.projects, rooms: after.rooms };
}

export async function verifyRestoredWorkspace() {
  const marker = verifyEmulatorWorkspace();
  if (!marker) throw new Error("Export the running local workspace before restarting it.");
  const current = await liveState(marker.version >= 2, marker.version >= 3);
  if (JSON.stringify(current) !== JSON.stringify(marker.liveState)) throw new Error("The running emulator data does not match the saved local workspace.");
  return { status: "restore_verified", projectId: PROJECT, authUsers: current.authUsers, projects: current.projects, ...(marker.version >= 2 ? { rooms: current.rooms } : {}) };
}

// Startup-only repair for firebase-tools importing every account with a new
// validSince value. Restore the verified snapshot's own security boundary before
// starting the application; never bypass Firebase Admin token verification.
export async function restoreEmulatorAuthContinuity() {
  const marker = verifyEmulatorWorkspace();
  if (!marker) return { status: "no_snapshot", authUsers: 0, updated: 0 };
  await verifyLocalHub();
  const saved = readJson(path.join(workspace, "auth_export/accounts.json"));
  const endpoint = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet?maxResults=-1`;
  const current = await localJson(endpoint, true);
  const updates = planAuthValidityRestore(saved.users, current.users ?? []);
  for (const update of updates) {
    await localJson("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update", true, update);
  }
  const restored = await localJson(endpoint, true);
  if (planAuthValidityRestore(saved.users, restored.users ?? []).length ||
      fingerprint(authValidityState(saved.users)) !== fingerprint(authValidityState(restored.users ?? []))) {
    throw new Error("The saved local Auth continuity state could not be restored.");
  }
  return { status: "auth_continuity_restored", authUsers: saved.users.length, updated: updates.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !["export", "check", "verify-restored"].includes(args[0])) throw new Error("Usage: node scripts/local-emulator-state.mjs export|check|verify-restored");
    if (args[0] === "export") console.log(JSON.stringify(await exportEmulatorWorkspace()));
    else if (args[0] === "verify-restored") console.log(JSON.stringify(await verifyRestoredWorkspace()));
    else {
      const saved = verifyEmulatorWorkspace();
      console.log(JSON.stringify({ status: saved ? "snapshot_verified" : "no_snapshot", projectId: PROJECT, files: saved?.files.length ?? 0 }));
    }
  } catch (error) {
    // SDK/parser failures can contain data. Do not forward raw exceptions.
    console.error("Local emulator state operation failed; exported payloads and credentials were not displayed.");
    process.exitCode = 1;
  }
}
