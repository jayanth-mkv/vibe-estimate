import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { root } from "./local-env.mjs";

export function nodeChild(relative, args, env, cwd = root, stdio = "inherit") {
  return spawn(process.execPath, [path.join(root, relative), ...args], { cwd, env, stdio, windowsHide: true });
}
export function completion(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error("Child exited: " + (code ?? signal))));
  });
}
export function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(400);
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
export async function waitPort(port, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for local port " + port);
}
export function stopChild(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    // Only terminate the child process tree that this runner started.
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else child.kill("SIGTERM");
}
