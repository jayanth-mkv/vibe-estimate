import path from "node:path";
import { connectedConfigArgument, connectedEnvironments } from "./connected-config.mjs";
import { root } from "./local-env.mjs";
import { nodeChild, portOpen, waitPort, stopChild } from "./processes.mjs";

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
function start(script, args, cwd, env) {
  const child = nodeChild(script, args, env, cwd);
  children.push(child);
  child.once("error", () => { console.error("A connected local service could not start. Private configuration values were not displayed."); stop(1); });
  child.once("exit", code => { if (!stopping) { console.error("A connected local service stopped with exit code " + (Number.isInteger(code) ? code : "unknown") + "."); stop(code || 1); } });
}
try {
  const { backendEnv, frontendEnv, frontendOrigin } = connectedEnvironments(connectedConfigArgument(process.argv.slice(2)));
  for (const port of [3000, 8080]) if (await portOpen(port)) throw new Error("A required local application port is already in use.");
  console.log("Starting the connected VibeEstimate workspace. Firebase uses the configured cloud project; Gemini uses the authorized profile. No emulators are started.");
  start("node_modules/tsx/dist/cli.mjs", ["watch", "src/index.ts"], path.join(root, "backend"), backendEnv);
  await waitPort(8080);
  const response = await fetch("http://127.0.0.1:8080/health", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("The connected API is not ready.");
  const health = await response.json();
  if (health.runtime !== "connected" || health.auth !== "firebase" || health.storageConnection !== "cloud" || health.aiProvider !== "gemini" || health.geminiTransport !== "vertex") throw new Error("The API does not match the connected configuration.");
  start("node_modules/next/dist/bin/next", ["dev", "--hostname", "127.0.0.1", "--port", "3000"], path.join(root, "frontend"), frontendEnv);
  await waitPort(3000);
  // A listening development server can still have a stale route manifest.
  // Server-render these pages before announcing readiness; no browser JavaScript,
  // Firebase identity, data request or model call is executed by this probe.
  for (const route of ["/", "/join", "/rooms/00000000-0000-4000-8000-000000000000", "/client/rooms/00000000-0000-4000-8000-000000000000"]) {
    const page = await fetch(frontendOrigin + route, { signal: AbortSignal.timeout(30000) });
    if (!page.ok) throw new Error("The frontend route manifest is not ready.");
    await page.body?.cancel();
  }
  console.log("Ready: " + frontendOrigin + " | API http://127.0.0.1:8080/health | Cloud Firebase with guest access");
} catch {
  console.error("The connected workspace could not start. Check the external configuration and local application ports. Private values were not displayed.");
  stop(1);
}
