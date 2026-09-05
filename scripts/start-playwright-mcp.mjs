import path from "node:path";
import { spawn } from "node:child_process";
import { localEnv, root } from "./local-env.mjs";

const child = spawn(process.execPath, [
  path.join(root, "node_modules/@playwright/mcp/cli.js"),
"--isolated", "--browser", "chromium",
  "--output-dir", path.join(root, ".cache/mcp-output"),
  ...process.argv.slice(2)
], { cwd: root, env: localEnv(), stdio: "inherit", windowsHide: true });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
