import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const evidence = process.env.V1_EVIDENCE_DIR;
const baseURL = process.env.VIBEESTIMATE_E2E_BASE_URL;
if (!evidence || !fs.existsSync(evidence) || baseURL !== 'http://127.0.0.1:3100') throw new Error('Start the isolated V1 runner; an explicit local target and evidence directory are required.');
const live = process.env.V1_PROVIDER === 'gemini';
const legacy = process.env.V1_LEGACY === '1';
if (live && legacy) throw new Error('Legacy fixture checks cannot run with live inference.');
const stories = live ? ['**/v1/live.spec.ts'] : ['**/v1/journeys.spec.ts', '**/v1/recovery.spec.ts'];
export default defineConfig({
  testDir: '..', fullyParallel: false, workers: 1, retries: 0,
  timeout: 180_000, expect: { timeout: 60_000 },
  outputDir: path.join(evidence, 'evidence'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(evidence, 'report') }], ['json', { outputFile: path.join(evidence, 'browser.json') }]],
  // On this Windows host, recording plus 3D reproducibly stalls the local
  // gcloud subprocess. Keep local live runs headed with geometry/screenshots;
  // deterministic and separately configured production stories retain video.
  use: { baseURL, headless: false, actionTimeout: 20_000, trace: 'off', screenshot: 'only-on-failure', video: { mode: live ? 'off' : 'on', size: { width: 1440, height: 1000 } }, serviceWorkers: 'block' },
  projects: [
    { name: live ? 'live-desktop' : 'desktop', testMatch: [...stories, ...(!live ? ['**/v1/access.spec.ts'] : []), ...(legacy ? ['**/e2e/*.spec.ts'] : [])], use: { viewport: { width: 1440, height: 1000 } } },
    ...(!live ? [
      { name: 'mobile', testMatch: [...stories, ...(legacy ? ['**/e2e/ui.spec.ts', '**/e2e/rooms.spec.ts', '**/e2e/review-recovery.spec.ts'] : [])], use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, video: { mode: 'on' as const, size: { width: 390, height: 844 } } } },
      { name: 'narrow', testMatch: ['**/v1/responsive.spec.ts'], use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' as const, video: { mode: 'on' as const, size: { width: 320, height: 740 } } } },
    ] : []),
  ],
});
