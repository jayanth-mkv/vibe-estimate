import type { Page } from '@playwright/test';
import { test, expect, fixtureHealth, accessible, capture } from './helpers';
import { createHome } from './ui';

const camera = (page: Page) => page.evaluate(() => window.__house!.inspect().camera.map(value => Math.round(value * 1000)));
const PASS_THROUGH = /hall|corridor|passage|landing|entr|lobby|foyer|lift/i;

test('Home Tour walks room by room at eye level with pause, speed and room skipping', async ({ page, request }, info) => {
  await fixtureHealth(request);
  const home = await createHome(page, 'compact-apartment');
  const rooms = home.scene!.rooms.filter(room => !PASS_THROUGH.test(room.name)).length;
  await page.getByRole('button', { name: 'Home Tour', exact: true }).click();
  const bar = page.getByRole('group', { name: 'Home Tour controls' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText('Starting at the entrance')).toBeVisible();
  await expect(bar.getByText(/^Next: /)).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Previous room' })).toBeDisabled();

  // It walks: the eye-level camera moves on its own.
  await expect.poll(async () => (await camera(page))[1], { timeout: 20_000 }).toBe(1600);
  const first = await camera(page);
  await expect.poll(async () => JSON.stringify(await camera(page)), { timeout: 15_000 }).not.toBe(JSON.stringify(first));

  // Pause holds the view still.
  await bar.getByRole('button', { name: 'Pause tour' }).click();
  await expect(bar.getByRole('button', { name: 'Resume tour' })).toBeVisible();
  await page.waitForTimeout(300); // let the frame already in flight finish
  const paused = await camera(page);
  await page.waitForTimeout(1200);
  expect(await camera(page)).toEqual(paused);

  // Each room the caption names is really entered: jump there, pause, and check
  // the camera stands inside that room's walls.
  const visit = async (button: 'Next room' | 'Previous room') => {
    await bar.getByRole('button', { name: button }).click();
    await bar.getByRole('button', { name: 'Pause tour' }).click();
    const name = (await bar.locator('p strong').textContent())!.trim();
    const room = home.scene!.rooms.find(entry => entry.name === name)!;
    expect(room, name).toBeTruthy();
    await expect.poll(async () => { const [x, , z] = await camera(page); return x > room.x && x < room.x + room.width && z > room.z && z < room.z + room.depth; }, { timeout: 10_000, message: `camera inside ${name}` }).toBe(true);
    return name;
  };
  const second = await visit('Next room');
  await expect(bar.getByText(new RegExp(`^Room [12] of ${rooms}$`))).toBeVisible();
  await capture(page, info, 'home-tour-inside-room');
  const third = await visit('Next room');
  expect(third).not.toBe(second);
  expect(await visit('Previous room')).toBe(second);

  // Resume at double speed carries on walking.
  await bar.getByLabel('Tour speed').selectOption('2');
  await bar.getByRole('button', { name: 'Resume tour' }).click();
  const resumed = await camera(page);
  await expect.poll(async () => JSON.stringify(await camera(page)), { timeout: 15_000 }).not.toBe(JSON.stringify(resumed));
  await accessible(page);

  await bar.getByRole('button', { name: 'Exit tour' }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Home Tour', exact: true })).toBeVisible();
});
