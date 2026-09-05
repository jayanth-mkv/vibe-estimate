import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { houseFixtures } from '@vibeestimate/scene-core';
import { pixelDifference, pngPixels } from './png';

test.setTimeout(180_000);
test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:3100' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    throw new Error(`External request forbidden: ${url.origin}${url.pathname}`);
  });
  mkdirSync('docs/screenshots/spatial', { recursive: true });
  mkdirSync('docs/spatial-fixtures', { recursive: true });
});
const status = (page: Page) => page.getByRole('region', { name: 'House preview' }).getByRole('status');
async function ready(page: Page) {
  await expect.poll(async () => {
    const state = await status(page).textContent();
    if (state === '3D unavailable') throw new Error(await page.locator('.failure-message').innerText());
    return state;
  }).toBe('Pascal 3D ready');
  await expect(status(page)).toHaveText('Pascal 3D ready');
  await expect.poll(() => page.evaluate(() => window.__house?.inspect().ready ?? false)).toBe(true);
}
async function settled(page: Page) {
  await page.locator('.house-canvas').scrollIntoViewIfNeeded();
  const frames = await page.evaluate(() => window.__house!.inspect().frames);
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().frames)).toBeGreaterThan(frames + 15);
}
async function example(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Apply patch', exact: true }).click();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.locator('.house-canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/screenshots/spatial/${info.project.name}-${name}.png`, fullPage: true });
}

test('complete house and adjoining fixtures render actual local models and openings', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('[viewer] WebGPU device lost: reason="destroyed"')) errors.push(message.text()); });
  await page.goto('/studio'); await ready(page); await settled(page);
  const report = await page.evaluate(() => window.__house!.inspect());
  expect(report.backend).toMatch(/WebGPU|WebGL/);
  expect(Object.values(report.entities).filter(e => e.type === 'wall')).toHaveLength(19);
  expect(Object.keys(report.openings)).toHaveLength(11);
  for (const opening of Object.values(report.openings)) { expect(opening.holeHits).toBe(0); expect(opening.lintelHits).toBeGreaterThan(0); }
  // Pascal covers the exterior wall band and half of the shared wall band.
  // The canonical living room remains 5.3 m clear between the inside faces.
  expect(report.entities.living.min[0]).toBeCloseTo(-.2, 3);
  expect(report.entities.living.max[0]).toBeCloseTo(5.4, 3);
  expect(report.entities['sofa-living'].max[0] - report.entities['sofa-living'].min[0]).toBeCloseTo(2.2, 3);
  expect(report.entities['sofa-living'].max[1] - report.entities['sofa-living'].min[1]).toBeCloseTo(.85, 3);
  expect(report.entities['bed-bedroom'].max[2] - report.entities['bed-bedroom'].min[2]).toBeCloseTo(2.1, 3);
  expect(report.assetFailures).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('initial-house-geometry', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  const resources = await page.evaluate(() => { const rows = performance.getEntriesByType('resource') as PerformanceResourceTiming[]; return { requests: rows.length, encodedBytes: rows.reduce((n, r) => n + r.encodedBodySize, 0), decodedBytes: rows.reduce((n, r) => n + r.decodedBodySize, 0), readyObservedMs: Math.round(performance.now()) }; });
  await info.attach('house-resources', { body: JSON.stringify(resources), contentType: 'application/json' });
  expect(resources.encodedBytes).toBeLessThan(info.project.name === 'desktop' ? 5_000_000 : 3_000_000);
  await screenshot(page, info, 'overview');
  const canvas = await page.locator('.house-canvas canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2); await page.mouse.down();
  await page.mouse.move(canvas!.x + canvas!.width / 2 + 70, canvas!.y + canvas!.height / 2 + 25, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(before => Math.hypot(...window.__house!.inspect().camera.map((n, i) => n - before[i])), report.camera)).toBeGreaterThan(.2);
  await page.getByRole('button', { name: 'Reset view', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(before => Math.hypot(...window.__house!.inspect().camera.map((n, i) => n - before[i])), report.camera)).toBeLessThan(.001);
  await page.getByRole('button', { name: 'Inside', exact: true }).click(); await settled(page);
  expect((await page.evaluate(() => window.__house!.inspect())).camera[1]).toBeCloseTo(1.6, 2);
  await screenshot(page, info, 'inside');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('region', { name: 'House preview' }).getByRole('img', { name: /floor plan/i })).toBeVisible();
  await screenshot(page, info, 'plan');
  await page.getByRole('button', { name: 'Focused room', exact: true }).click();
  await expect(page.getByRole('region', { name: 'House preview' }).getByRole('img', { name: /Living & dining focused room floor plan/ })).toBeVisible();
  await expect(page.locator('.house-plan-inspection')).toContainText('5,300 × 3,800 mm');
  expect(await page.locator('.house-plan-inspection p span').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  await screenshot(page, info, 'focused-plan');
  await page.getByRole('button', { name: 'Whole floor', exact: true }).click();
  if (info.project.name === 'desktop') {
    const pngDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download floor-plan PNG', exact: true }).click();
    await (await pngDownload).saveAs('docs/spatial-fixtures/house-floor-plan.png');
    const png = pngPixels(readFileSync('docs/spatial-fixtures/house-floor-plan.png')); expect(png.width).toBe(1800); expect(png.height).toBeGreaterThan(1000);
    const jsonDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export scene JSON', exact: true }).click();
    await (await jsonDownload).saveAs('docs/spatial-fixtures/house.json'); expect(JSON.parse(readFileSync('docs/spatial-fixtures/house.json', 'utf8'))).toEqual(houseFixtures.house);
  }
  await page.getByRole('button', { name: 'Overview', exact: true }).click(); await ready(page);
  for (const fixture of ['adjoining', 'room']) {
    await page.getByLabel('Fixture', { exact: true }).selectOption(fixture); await ready(page); await settled(page);
    const next = await page.evaluate(() => window.__house!.inspect());
    expect(Object.values(next.entities).filter(e => e.type === 'wall')).toHaveLength(fixture === 'adjoining' ? 7 : 4);
    await screenshot(page, info, `${fixture}-overview`);
  }
  if (info.project.name === 'desktop') {
    const pngDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download floor-plan PNG', exact: true }).click();
    await (await pngDownload).saveAs('docs/spatial-fixtures/measured-room-floor-plan.png');
    const jsonDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export scene JSON', exact: true }).click();
    await (await jsonDownload).saveAs('docs/spatial-fixtures/measured-room.json');
  }
  const lifecycle = await page.evaluate(() => window.__houseLifecycle);
  expect(lifecycle!.mounts).toBeGreaterThanOrEqual(4); expect(lifecycle!.disposals).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('programmatic edits change actual lights, one wall face and furniture while rejecting invalid batches', async ({ page }, info) => {
  await page.goto('/studio'); await ready(page);
  await example(page, 'Light every room'); await ready(page);
  await expect.poll(() => page.evaluate(() => Object.keys(window.__house!.inspect().lights).length)).toBe(7);
  await page.getByRole('button', { name: 'Evening', exact: true }).click();
  await page.getByRole('button', { name: 'Inside', exact: true }).click();
  await page.getByLabel('Select an entity', { exact: true }).selectOption('ceiling-living'); await settled(page);
  const before = await page.evaluate(() => window.__house!.inspect());
  expect(before.lights['ceiling-living'].position).toEqual([2.65, 2.45, 1.9]);
  expect(before.lights['ceiling-living'].intensity).toBe(65);
  const on = await page.locator('.house-canvas canvas').screenshot({ path: `docs/screenshots/spatial/${info.project.name}-lights-on.png` });
  await page.getByLabel('Light enabled', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Apply light settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().lights['ceiling-living']?.intensity)).toBe(0); await settled(page);
  const after = await page.evaluate(() => window.__house!.inspect());
  expect(after.camera).toEqual(before.camera);
  expect(Object.values(after.lights).filter(l => l.id !== 'ceiling-living')).toEqual(Object.values(before.lights).filter(l => l.id !== 'ceiling-living'));
  const off = await page.locator('.house-canvas canvas').screenshot({ path: `docs/screenshots/spatial/${info.project.name}-lights-off.png` });
  const difference = pixelDifference(on, off);
  await info.attach('actual-light-illumination', { body: JSON.stringify(difference), contentType: 'application/json' });
  expect(difference.meanRgbDifference).toBeGreaterThan(1);
  expect(difference.beforeBrightness).toBeGreaterThan(difference.afterBrightness);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().lights['ceiling-living']?.intensity)).toBe(65);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().lights['ceiling-living']?.intensity)).toBe(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await example(page, 'Change the room finishes'); await settled(page);
  const painted = await page.evaluate(() => window.__house!.inspect());
  const wall = houseFixtures.house.walls.find(w => w.frontRoomId === 'living' && w.backRoomId === 'kitchen')!;
  expect(painted.wallFaces[wall.id].front.color).toBe('#ba7761');
  expect(painted.wallFaces[wall.id].back.color).toBe('#e8e1d5');
  await example(page, 'Resize the dining table');
  await expect.poll(() => page.evaluate(() => { const box = window.__house!.inspect().entities['table-living']; return box.max[0] - box.min[0]; })).toBeCloseTo(1.6, 3);
  await example(page, 'Move and turn the sofa');
  await expect.poll(() => page.evaluate(() => window.__house!.inspect().entities['sofa-living'].position[0])).toBeCloseTo(2, 3);
  const valid = await page.evaluate(() => window.__house!.inspect());
  await example(page, 'Reject an atomic collision');
  await expect(page.getByRole('alert').filter({ hasText: 'Change could not be completed' })).toContainText('collision');
  const rejected = await page.evaluate(() => window.__house!.inspect());
  expect(rejected.entities.living.materials).toEqual(valid.entities.living.materials);
  expect(rejected.entities['sofa-living'].min).toEqual(valid.entities['sofa-living'].min);
  await example(page, 'Reject an unselected change'); await expect(page.getByRole('alert').filter({ hasText: 'Change could not be completed' })).toContainText('outside the frozen selection');
  await example(page, 'Keep a locked object fixed'); await expect(page.getByRole('alert').filter({ hasText: 'Change could not be completed' })).toContainText('locked');
  await screenshot(page, info, 'edits-and-rejection');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await info.attach('edited-renderer-geometry', { body: JSON.stringify(valid, null, 2), contentType: 'application/json' });
  await page.getByLabel('Select an entity', { exact: true }).selectOption('chair-north');
  await page.getByLabel('Scene patch JSON', { exact: true }).fill(JSON.stringify({ schemaVersion: 2, operations: [{ op: 'replace', entityId: 'chair-north', catalogId: 'floor-lamp' }] }));
  await page.getByRole('button', { name: 'Apply patch', exact: true }).click();
  await expect.poll(() => page.evaluate(() => { const e = window.__house!.inspect().entities['chair-north']; return e.max[1] - e.min[1]; })).toBeCloseTo(1.6, 3);
  await expect.poll(() => page.evaluate(() => Boolean(window.__house!.inspect().lights['chair-north']))).toBe(true);
  await page.getByRole('button', { name: 'Remove object', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__house!.inspect().entities['chair-north']))).toBe(false);
  await expect.poll(() => page.evaluate(() => Boolean(window.__house!.inspect().lights['chair-north']))).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__house!.inspect().lights['chair-north']))).toBe(true);
});

test('independent house Plan supports numeric region placement and explicit architecture without graphics', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { get: () => undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) { return String(args[0]).startsWith('webgl') ? null : original.apply(this, args); } as typeof original;
  });
  await page.goto('/studio'); await expect(status(page)).toHaveText('3D unavailable');
  await screenshot(page, info, 'graphics-failure');
  await page.getByRole('button', { name: 'Open Plan', exact: true }).click();
  await example(page, 'Add a lamp in a region');
  await expect(page.locator('.house-notice')).toContainText('Change applied');
  await page.getByText('Define a Plan region', { exact: true }).click();
  await expect(page.locator('.house-region-members')).toContainText('1 fully contained objects');
  await page.getByRole('button', { name: 'Select contained objects', exact: true }).click();
  await page.getByLabel('Light enabled', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Apply light settings', exact: true }).click();
  await expect(page.locator('.house-notice')).toContainText('Change applied');
  await example(page, 'Move an opening in Plan'); await expect(page.locator('.house-notice')).toContainText('Change applied');
  await screenshot(page, info, 'plan-edits');
  expect(await page.evaluate(() => Boolean(window.__house))).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
