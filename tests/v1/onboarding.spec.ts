import { test, expect, fixtureHealth, accessible, capture } from './helpers';
import type { HomeProject } from '../../backend/src/home-types';

test('a visitor tries a furnished home without an account, restyles and arranges it, then saves it as a real home', async ({ page, request }, info) => {
  await fixtureHealth(request);
  await page.goto('/');
  await page.getByRole('link', { name: /Try a furnished home · no sign-up/ }).click();
  await expect(page).toHaveURL(/\/try$/);
  await expect(page.getByRole('heading', { name: 'Try a furnished home' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('img', { name: /floor plan/i })).toBeVisible();
  await capture(page, info, 'try-first-view', false);
  await accessible(page);

  // Dropping a piece onto another one is refused, and the person is told why it stayed put.
  const sofa = page.locator('.home-canvas svg [data-instance-id="sofa-living"]');
  await sofa.click();
  const placed = await sofa.evaluate(element => element.outerHTML.replace(/class="[^"]*"/g, ''));
  const from = (await sofa.boundingBox())!, onto = (await page.locator('.home-canvas svg [data-instance-id="table-living"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  for (let step = 1; step <= 15; step++) await page.mouse.move(from.x + from.width / 2 + (onto.x + onto.width / 2 - from.x - from.width / 2) * step / 15, from.y + from.height / 2 + (onto.y + onto.height / 2 - from.y - from.height / 2) * step / 15);
  await page.mouse.up();
  await expect(page.getByText('That spot isn’t clear, so the piece stays where it was. Try an open stretch of wall.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(await sofa.evaluate(element => element.outerHTML.replace(/class="[^"]*"/g, ''))).toBe(placed);

  await page.getByRole('button', { name: 'Calm sage', exact: true }).click();
  await expect(page.getByText('Calm sage applied.')).toBeVisible();
  await page.getByRole('button', { name: 'Arrange for me', exact: true }).click();
  await expect(page.getByText(/Room arranged|already arranged/)).toBeVisible();
  await page.getByRole('button', { name: 'Bold navy', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  const created = page.waitForResponse(result => result.url().endsWith('/api/homes') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save this home' }).first().click();
  expect((await created).ok()).toBe(true);
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const homeId = page.url().split('/').pop()!;
  const headers = { Authorization: (await created).request().headers().authorization };
  const saved = (await (await page.request.get('/api/homes/' + homeId, { headers })).json()).home as HomeProject;
  expect(saved.revisions.length).toBeGreaterThanOrEqual(2);
  expect(saved.scene!.walls.some(wall => wall.frontMaterialId === 'paint-sage' || wall.backMaterialId === 'paint-sage')).toBe(true);
  expect(saved.scene!.walls.some(wall => wall.frontMaterialId === 'paint-navy' || wall.backMaterialId === 'paint-navy')).toBe(false);

  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Add more light', exact: true }).click();
  await page.getByRole('button', { name: 'Design it for a family with children', exact: true }).click();
  await expect(page.getByLabel('Describe your design', { exact: true })).toHaveValue('Add more light. Design it for a family with children.');
  await page.getByRole('button', { name: 'Add more light', exact: true }).click();
  await expect(page.getByLabel('Describe your design', { exact: true })).toHaveValue('Design it for a family with children.');
  const styled = page.waitForResponse(result => result.url().endsWith('/style') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Earthy clay', exact: true }).click();
  expect((await styled).ok()).toBe(true);
  await expect(page.getByText(/Earthy clay applied and saved/)).toBeVisible();
  await capture(page, info, 'studio-quick-styles', false);
  await accessible(page);
});
