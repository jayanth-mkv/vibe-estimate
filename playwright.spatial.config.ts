import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/spatial/browser', fullyParallel: false, workers: 1,
  timeout: 180_000, expect: { timeout: 60_000 },
  outputDir: 'test-results/spatial',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/spatial' }], ['json', { outputFile: '.cache/spatial/browser.json' }]],
  use: { baseURL: 'http://127.0.0.1:3100', headless: false, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'narrow', use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' } },
  ],
  webServer: { command: 'rtk npm run start:spatial', url: 'http://127.0.0.1:3100/studio', reuseExistingServer: false, timeout: 120_000 },
});
