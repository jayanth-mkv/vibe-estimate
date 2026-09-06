import { test as base, expect, type Page, type TestInfo, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { HomeProject } from '../../backend/src/home-types';
import { pngPixels } from '../spatial/browser/png';
import type {} from '@vibeestimate/pascal-adapter';

export const origin = 'http://127.0.0.1:3100';
export const test = base.extend<{ browserFailures: string[] }>({
  browserFailures: [async ({ context }, use) => {
    const failures: string[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && ['3100', '8181', '9299', '8285'].includes(url.port)) return route.continue();
      failures.push('The browser attempted an external request.');
      await route.abort('blockedbyclient');
    });
    context.on('page', page => page.on('pageerror', error => failures.push(error.message)));
    await use(failures);
    expect(failures).toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function fixtureHealth(request: APIRequestContext) {
  const response = await request.get(origin + '/health');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ runtime: 'local', aiProvider: 'fixture', auth: 'emulator', storageConnection: 'emulator' });
}

export async function identity(request: APIRequestContext) {
  const response = await request.post('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { data: { returnSecureToken: true } });
  expect(response.ok()).toBe(true);
  const { idToken } = await response.json();
  return { Authorization: 'Bearer ' + idToken };
}

export const requestId = () => randomUUID();
export async function apiHome(request: APIRequestContext, headers: Record<string, string>, templateId = 'family-home') {
  const created = await request.post(origin + '/api/homes', { headers, data: { requestId: requestId() } });
  expect(created.ok()).toBe(true);
  const initial = (await created.json()).home as HomeProject;
  const chosen = await request.post(origin + '/api/homes/' + initial.id + '/template', { headers, data: { templateId, baseRevisionId: null, requestId: requestId() } });
  expect(chosen.ok()).toBe(true);
  return (await chosen.json()).home as HomeProject;
}

export async function geometry(page: Page) {
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => window.__house?.inspect().ready ?? false), { message: 'Actual Pascal 3D must initialize, not its Plan fallback.', timeout: 90000 }).toBe(true);
  const initialFrames = await page.evaluate(() => window.__house!.inspect().frames);
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().frames)).toBeGreaterThan(initialFrames + 12);
  const report = await page.evaluate(() => window.__house!.inspect());
  expect(report.backend).toMatch(/WebGPU|WebGL/);
  expect(report.meshCount).toBeGreaterThan(0);
  expect(report.assetFailures).toEqual([]);
  for (const opening of Object.values(report.openings)) { expect(opening.holeHits).toBe(0); expect(opening.lintelHits).toBeGreaterThan(0); }
  return report;
}

export async function capture(page: Page, info: TestInfo, name: string, rendered = true) {
  if (rendered) {
    const report = await geometry(page);
    await info.attach(name + '-actual-geometry', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  }
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
}

export async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
}

export async function downloadedText(page: Page, buttonName: string, info: TestInfo, filename: string) {
  const awaited = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await awaited;
  const target = info.outputPath(filename);
  await download.saveAs(target);
  return fs.readFile(target, 'utf8');
}

export async function downloadedPlan(page: Page, info: TestInfo, filename: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download floor plan', exact: true }).click();
  const download = await pending;
  const target = info.outputPath(filename);
  await download.saveAs(target);
  const image = pngPixels(await fs.readFile(target));
  expect({ width: image.width, height: image.height }).toEqual({ width: 1600, height: 1200 });
  return { ...image, filename: download.suggestedFilename() };
}
