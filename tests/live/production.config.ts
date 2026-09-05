import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const baseURL = process.env.VERIFICATION_BASE_URL;
const evidence = process.env.PRODUCTION_EVIDENCE_DIR;
if (!baseURL || !evidence || !path.isAbsolute(evidence) || path.resolve(evidence).startsWith(path.resolve(__dirname, "../..") + path.sep)) throw new Error("Explicit target and external private evidence directory are required.");

export default defineConfig({
  testDir: ".", testMatch: ["**/connected-rooms.spec.ts", "**/production.spec.ts"],
  outputDir: path.join(evidence, "results"), workers: 1, fullyParallel: false, retries: 0,
  timeout: 210000, expect: { timeout: 20000 },
  reporter: [["list"], ["json", { outputFile: path.join(evidence, "results.json") }]],
  use: { baseURL, actionTimeout: 20000, trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
  projects: [{ name: "production-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
});
