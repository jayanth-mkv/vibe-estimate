import { spawn } from "node:child_process";

// One Cloud Run origin, two application boundaries. No local credentials or emulators.
if (process.env.APP_ENV !== "production" || process.env.NODE_ENV !== "production" || !process.env.FIREBASE_WEB_CONFIG) throw new Error("Explicit production settings are required.");
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 8000).unref();
}
const backend = spawn(process.execPath, ["backend/dist/index.js"], { stdio: "inherit", env: { ...process.env, PORT: "8081" } });
children.push(backend);
backend.on("exit", code => stop(code || 1));
for (let attempts = 0; attempts < 100; attempts++) {
  if (stopping) break;
  const ready = await fetch("http://127.0.0.1:8081/health").then(response => response.ok).catch(() => false);
  if (ready) {
    const frontend = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "frontend", "--hostname", "0.0.0.0", "--port", process.env.PORT || "8080"], { stdio: "inherit", env: { ...process.env, BACKEND_ORIGIN: "http://127.0.0.1:8081" } });
    children.push(frontend);
    frontend.on("exit", code => stop(code || 1));
    break;
  }
  if (attempts === 99) stop(1);
  await new Promise(resolve => setTimeout(resolve, 200));
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
