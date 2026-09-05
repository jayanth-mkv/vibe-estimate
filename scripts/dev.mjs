import path from "node:path";
import { localEnv, root } from "./local-env.mjs";
import { geminiBackendEnv } from "./gemini-config.mjs";
import { nodeChild, portOpen, waitPort, stopChild } from "./processes.mjs";
import { emulatorImportArgs, restoreEmulatorAuthContinuity, verifyRestoredWorkspace } from "./local-emulator-state.mjs";

const env = localEnv();
let backendEnv = env;
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 2 || args[0] !== "--gemini-config") throw new Error("Usage: npm run dev -- --gemini-config <private JSON file outside this repository>");
  backendEnv = geminiBackendEnv(env, args[1]);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(stopChild);
  setTimeout(() => process.exit(code), 750);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(script, args, cwd, childEnv = env) {
  const child = nodeChild(script, args, childEnv, cwd);
  children.push(child);
  child.once("error", error => { console.error(error.message); stop(1); });
  child.once("exit", code => { if (!stopping) { console.error("A local service stopped:", code); stop(code || 1); } });
  return child;
}
try {
  for (const port of [3000, 8080, 8085, 9099, 4000, 4400, 4500]) {
    if (await portOpen(port)) throw new Error("Port " + port + " is already in use. Stop that local stack before starting another.");
  }
  console.log("Starting VibeEstimate. Auth/Firestore are emulated; " + (backendEnv.AI_PROVIDER === "gemini" ? (backendEnv.GEMINI_TRANSPORT === "vertex" ? "Gemini uses Vertex AI with the explicitly authorized local profile." : "Gemini requests use the explicitly supplied server credentials.") : "AI uses a labeled synthetic fixture."));
  const importArgs = emulatorImportArgs();
  if (importArgs.length) console.log("Restoring the verified local Auth/Firestore workspace.");
  start("node_modules/firebase-tools/lib/bin/firebase.js", ["emulators:start", "--only", "auth,firestore", "--project", "demo-vibeestimate", "--config", path.join(root, "firebase.json"), "--non-interactive", ...importArgs], path.join(root, ".cache/firebase"));
  // The first run downloads Google's emulator binaries into the project cache.
  await Promise.all([waitPort(9099, 300000), waitPort(8085, 300000)]);
  if (importArgs.length) {
    await waitPort(4400);
    await restoreEmulatorAuthContinuity();
    await verifyRestoredWorkspace();
    console.log("Verified saved identities, token validity, projects and rooms before starting the app.");
  }
  start("node_modules/tsx/dist/cli.mjs", ["watch", "src/index.ts"], path.join(root, "backend"), backendEnv);
  await waitPort(8080);
  start("node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1", "--port", "3000"], path.join(root, "frontend"));
  await waitPort(3000);
  console.log("Ready: http://127.0.0.1:3000 | API http://127.0.0.1:8080/health | Emulator UI http://127.0.0.1:4000");
} catch (error) {
  console.error(error.message);
  stop(1);
}
