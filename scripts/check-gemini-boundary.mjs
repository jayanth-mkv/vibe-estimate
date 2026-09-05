import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { geminiBackendEnv } from "./gemini-config.mjs";
import { root } from "./local-env.mjs";

try {
  const key = geminiBackendEnv({}, process.argv[2]).GEMINI_API_KEY;
  const listed = spawnSync("git", ["-c", "safe.directory=" + root.replaceAll("\\", "/"), "ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (listed.status !== 0) throw new Error();
  const paths = new Set(listed.stdout.trim().split(/\r?\n/).filter(Boolean).map(name => path.join(root, name)));
  function addStatic(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) addStatic(file);
      else if (entry.isFile()) paths.add(file);
    }
  }
  addStatic(path.join(root, "frontend/.next/static"));
  addStatic(path.join(root, "frontend/.next/dev/static"));
  let checked = 0;
  let leaked = false;
  for (const file of paths) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    checked++;
    if (fs.readFileSync(file).includes(Buffer.from(key))) leaked = true;
  }
  if (leaked) {
    console.error("Credential boundary FAILED: the live key was detected in publishable files or browser assets. No value or matching content was displayed.");
    process.exitCode = 1;
  } else console.log("Credential boundary PASS: live key absent from " + checked + " publishable files and generated browser assets. Key value was not displayed.");
} catch {
  console.error("Could not complete the credential boundary check. No configuration contents or raw errors were displayed.");
  process.exitCode = 1;
}
