import { test, expect, fixtureHealth, accessible, capture } from './helpers';
import { createHome } from './ui';

test('320px keyboard and non-drag Plan remain usable with graphics failure', async ({ page, request }, info) => {
  await fixtureHealth(request);
  await page.goto('/');
  await accessible(page);
  await page.getByRole('button', { name: 'New project', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Choose a starting home', exact: true })).toBeVisible();
  await accessible(page);
  await createHome(page, 'compact-apartment');
  await capture(page, info, 'narrow-normal-3d');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await accessible(page);
  await capture(page, info, 'narrow-plan', false);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { get: () => undefined, configurable: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) { return String(args[0]).startsWith('webgl') ? null : original.apply(this, args); } as typeof original;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(/3D.*unavailable|3D.*not available/i)).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('img', { name: /floor plan/i })).toBeVisible();
  await capture(page, info, 'narrow-graphics-fallback', false);
  await accessible(page);
});
