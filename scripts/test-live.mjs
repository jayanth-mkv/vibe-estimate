import { localEnv } from "./local-env.mjs";
import { nodeChild, completion } from "./processes.mjs";

try {
  const health = await (await fetch("http://127.0.0.1:8080/health")).json();
  if (health.aiProvider !== "gemini" || health.auth !== "emulator" || health.storage !== "firestore") {
    throw new Error("Start the explicit Gemini + Firebase emulator stack before live verification.");
  }
  console.log("Live Gemini verification: two reviews per standard viewport, plus at most two shared-room observations; no automatic test retries.");
  await completion(nodeChild("node_modules/@playwright/test/cli.js", ["test", "--config", "tests/live/playwright.config.ts", ...process.argv.slice(2)], { ...localEnv(), LIVE_GEMINI_TEST: "1" }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
