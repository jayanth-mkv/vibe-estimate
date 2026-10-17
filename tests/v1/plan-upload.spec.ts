import { test, expect, fixtureHealth, accessible, capture } from './helpers';
import type { HomeProject } from '../../backend/src/home-types';

/** Draw a simple two-room plan and photograph it, so the upload is a real image file. */
async function planPicture(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<body style="margin:0;background:#fff"><svg width="1000" height="800" xmlns="http://www.w3.org/2000/svg" style="font:20px Arial">
    <rect x="100" y="120" width="450" height="320" fill="none" stroke="#000" stroke-width="10"/><rect x="550" y="120" width="350" height="320" fill="none" stroke="#000" stroke-width="10"/>
    <text x="250" y="270">Living room</text><text x="250" y="300">4.5 x 3.2 m</text><text x="660" y="270">Bedroom</text><text x="660" y="300">3.5 x 3.2 m</text></svg></body>`);
  const buffer = await page.screenshot({ type: 'png' });
  await context.close();
  return buffer;
}

test('a homeowner uploads a floor plan and confirms it with taps only, then gets a furnished home', async ({ page, request, browser }, info) => {
  await fixtureHealth(request);
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a starting home' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Upload your floor plan' })).toBeVisible();
  await accessible(page);

  const uploaded = page.waitForResponse(result => /\/plans\?requestId=/.test(result.url()) && result.request().method() === 'POST');
  const read = page.waitForResponse(result => /\/plans\/[0-9a-f-]{36}\/read$/.test(result.url()));
  await page.getByLabel('Floor plan image').setInputFiles({ name: 'my-flat.png', mimeType: 'image/png', buffer: await planPicture(browser) });
  const upload = await uploaded;
  expect(upload.status()).toBe(201);
  expect(upload.request().headers()['content-type']).toBe('image/jpeg');
  expect((await read).ok()).toBe(true);
  await expect(page.getByText(/We read your plan/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '2 rooms found' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Your uploaded floor plan' })).toBeVisible();
  await expect(page.getByText(/Is this the right size\?/)).toBeVisible();
  const sizeLine = page.locator('.home-plan-scale strong');
  const before = await sizeLine.textContent();
  await page.getByRole('button', { name: 'A little bigger' }).click();
  await expect(sizeLine).not.toHaveText(before!);
  await page.getByRole('button', { name: 'A little smaller' }).click();
  await expect(sizeLine).toHaveText(before!);
  await page.locator('.home-plan-confirm li', { hasText: 'Bedroom' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('heading', { name: '1 rooms found' })).toBeVisible();
  await page.locator('.home-plan-confirm li', { hasText: 'Bedroom' }).getByRole('button', { name: 'Add back' }).click();
  await capture(page, info, 'plan-review', false);
  await accessible(page);

  const accepted = page.waitForResponse(result => /\/accept$/.test(result.url()));
  await page.getByRole('button', { name: 'Create my home' }).click();
  const home = (await (await accepted).json()).home as HomeProject;
  expect(home.revisions[0]!.source).toBe('plan');
  expect(home.scene!.rooms.map(room => room.name)).toEqual(['Living room', 'Bedroom']);
  expect(home.scene!.instances.length).toBeGreaterThan(2);
  await expect(page.getByRole('button', { name: 'Home Tour', exact: true })).toBeVisible();
  await expect(page.getByLabel('Design area', { exact: true }).locator('option', { hasText: 'Living room' })).toHaveCount(1);
  await expect(page.getByText(/furnished from your plan/)).toBeVisible();
  await expect(page.getByText('From your uploaded floor plan')).toBeVisible();
  await capture(page, info, 'plan-home-created');
});
