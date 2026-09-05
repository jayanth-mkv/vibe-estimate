import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Share one timestamp with Playwright workers. Keep live evidence under .cache
// because the ordinary fixture config clears the root test-results directory.
const runId = process.env.VIBEESTIMATE_LIVE_RUN_ID ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+$/.test(runId)) throw new Error("The live verification run ID must be a generated timestamp and process ID.");
process.env.VIBEESTIMATE_LIVE_RUN_ID = runId;
const evidenceRoot = path.resolve(__dirname, "../../.cache/live-gemini-runs", runId);

// Opt-in only. Start the Gemini + local Firebase stack separately; this config
// never creates credentials, starts services, or retries paid model requests.
export default defineConfig({
  testDir: ".",
  testMatch: ["**/gemini.spec.ts", "**/rooms.spec.ts"],
  outputDir: path.join(evidenceRoot, "test-results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  timeout: 150000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { outputFolder: path.join(evidenceRoot, "report"), open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "live-desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "live-mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: "**/gemini.spec.ts" }
  ]
});
