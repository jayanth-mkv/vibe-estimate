import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Playwright otherwise attaches a DOM error snapshot even when tracing and
// screenshots are off. An open invitation could put its secret link in it.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const runId = process.env.VIBEESTIMATE_CONNECTED_RUN_ID ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+$/.test(runId)) throw new Error("Connected verification requires a generated timestamp and process ID.");
process.env.VIBEESTIMATE_CONNECTED_RUN_ID = runId;
const evidenceRoot = path.resolve(__dirname, "../../.cache/connected-firebase-runs", runId);

// No service startup, model retries, credential recordings, or emulator helpers.
export default defineConfig({
  testDir: ".",
  testMatch: "**/connected-rooms.spec.ts",
  outputDir: path.join(evidenceRoot, "test-results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  timeout: 210000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { outputFolder: path.join(evidenceRoot, "report"), open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15000,
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block"
  },
  projects: [{ name: "connected-desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }]
});
