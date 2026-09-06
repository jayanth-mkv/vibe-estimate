import { defineConfig } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { isExternalEvidencePath } from '../../scripts/production-verification-env.mjs';

const evidence = process.env.PRODUCTION_EVIDENCE_DIR, baseURL = process.env.VERIFICATION_BASE_URL;
if (!evidence || !baseURL || process.env.VERIFICATION_RUNTIME !== 'production' || process.env.CONNECTED_FIREBASE_TEST !== '1'
  || !fs.existsSync(evidence) || !isExternalEvidencePath(fs.realpathSync(path.resolve(__dirname, '../..')), fs.realpathSync(evidence))) throw new Error('Explicit authorized production target and external private evidence are required.');
const target = JSON.parse(fs.readFileSync(path.join(evidence, 'v1-target.json'), 'utf8'));
if (target.origin !== baseURL || !/^[a-f0-9]{40}$/.test(target.expectedGitRevision) || target.explicitJobBudget !== 3 || target.providerAttemptBudget !== 6) throw new Error('Production V1 rehearsal target metadata is invalid.');

export default defineConfig({
  testDir: '.', testMatch: ['**/v1-production.spec.ts'], workers: 1, fullyParallel: false, retries: 0, maxFailures: 1,
  timeout: 240000, expect: { timeout: 60000 }, outputDir: path.join(evidence, 'results'),
  reporter: [['list'], ['json', { outputFile: path.join(evidence, 'results.json') }], ['html', { open: 'never', outputFolder: path.join(evidence, 'report') }]],
  use: { baseURL, headless: false, viewport: { width: 1440, height: 1000 }, actionTimeout: 20000, serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: { mode: 'on', size: { width: 1440, height: 1000 } }, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } },
  projects: [{ name: 'production-v1-desktop' }],
});
