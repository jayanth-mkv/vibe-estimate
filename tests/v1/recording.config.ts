import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const evidence = process.env.V1_RECORDING_DIR;
const root = path.resolve(__dirname, '../..');
if (!evidence || !fs.existsSync(evidence) || !path.resolve(evidence).startsWith(path.join(root, '.cache', 'v1') + path.sep)) throw new Error('A private local V1 recording directory is required.');
export default defineConfig({
  testDir: '.', testMatch: 'recording.spec.ts', workers: 1, retries: 0, maxFailures: 1,
  timeout: 480000, expect: { timeout: 60000 }, outputDir: path.join(evidence, 'evidence'),
  reporter: [['list'], ['json', { outputFile: path.join(evidence, 'browser.json') }]],
  use: { baseURL: 'http://127.0.0.1:3100', headless: false, actionTimeout: 20000, trace: 'off', screenshot: 'off', serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, video: { mode: 'on', size: { width: 1440, height: 1000 } }, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } },
});
