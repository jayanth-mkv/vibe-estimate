import { localEnv } from "./local-env.mjs";
import { nodeChild, completion } from "./processes.mjs";
try {
  await completion(nodeChild("node_modules/@playwright/test/cli.js", process.argv.slice(2), localEnv()));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
