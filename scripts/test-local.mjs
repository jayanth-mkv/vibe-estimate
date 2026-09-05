import { localEnv } from "./local-env.mjs";
import { nodeChild, completion, portOpen, waitPort, stopChild } from "./processes.mjs";

const env = localEnv();
let stack;
try {
  if (!(await portOpen(3000))) {
    stack = nodeChild("scripts/dev.mjs", [], env);
    await waitPort(3000, 360000);
  } else {
    const response = await fetch("http://127.0.0.1:8080/health");
    const health = await response.json();
    if (health.auth !== "emulator" || health.aiProvider !== "fixture") throw new Error("Refusing tests against a nonlocal/nonfixture API.");
  }
  await completion(nodeChild("node_modules/vitest/vitest.mjs", ["run", "--config", "vitest.rules.config.ts"], env));
  await completion(nodeChild("node_modules/@playwright/test/cli.js", ["test"], env));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stopChild(stack);
}
