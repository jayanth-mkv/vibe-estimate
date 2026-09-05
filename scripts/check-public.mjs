import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./local-env.mjs";

const listed = spawnSync("git", ["-c", "safe.directory=" + root.replaceAll("\\", "/"), "ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8" });
if (listed.status !== 0) throw new Error("Could not enumerate the public checkout.");
const files = [...new Set(listed.stdout.trim().split(/\r?\n/).filter(Boolean))];
const privatePath = path.resolve(root, "../docs/private/local-config.json");
const forbidden = [];
if (fs.existsSync(privatePath)) {
  const context = JSON.parse(fs.readFileSync(privatePath, "utf8"));
  for (const name of ["account", "gcloudConfiguration", "backendProjectId", "firebaseProjectId", "cloudBuildConnection"]) {
    if (typeof context[name] === "string") forbidden.push(context[name]);
  }
}
const failures = [];
let checked = 0;
for (const name of files) {
  if (name.startsWith(".agents/")) continue; // Vendored third-party instructions have separate provenance.
  const absolute = path.join(root, name);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith(".example")) failures.push(name + ": environment file in public set");
  if (/\.tfstate(?:\.|$)|\.tfplan$|\.tfvars$/.test(name)) failures.push(name + ": infrastructure state/private variable file");
  if (fs.statSync(absolute).size > 3000000) continue;
  const text = fs.readFileSync(absolute, "utf8");
  if (text.includes("\0")) continue;
  checked++;
  if (/AIza[A-Za-z0-9_-]{30,}/.test(text) || /ya29\.[A-Za-z0-9._~-]{25,}/.test(text) || /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text)) failures.push(name + ": possible credential");
  if (forbidden.some(value => text.includes(value))) failures.push(name + ": private operator value");
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("Public-check PASS: " + checked + " text files; no detected secrets or private operator values. This is a focused check, not a security guarantee.");
