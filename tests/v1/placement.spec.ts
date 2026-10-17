import type { Page } from '@playwright/test';
import { test, expect, fixtureHealth, accessible, capture } from './helpers';
import { createHome } from './ui';
import type { HomeProject } from '../../backend/src/home-types';

async function screenPoint(page: Page, x: number, z: number) {
  return page.evaluate(([px, pz]) => {
    const svg = document.querySelector('.home-canvas svg.house-plan') as SVGSVGElement;
    const p = new DOMPoint(px, pz).matrixTransform(svg.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, [x, z] as const);
}
const savedRevision = (page: Page) => page.waitForResponse(result => /\/revisions$/.test(result.url()) && result.request().method() === 'POST');

test('furniture moves by dragging and snapping, nudges by key, and rooms arrange themselves without typed values', async ({ page, request }, info) => {
  await fixtureHealth(request);
  const home = await createHome(page, 'compact-apartment');
  const sofa = home.scene!.instances.find(item => item.catalogId === 'sofa')!;
  const room = home.scene!.rooms.find(item => item.id === sofa.roomId)!;
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit selection', { exact: true }).selectOption('object:' + sofa.id);
  await expect(page.getByRole('button', { name: 'Rotate 90°' })).toBeVisible();

  const from = await screenPoint(page, sofa.position[0], sofa.position[2]);
  const to = await screenPoint(page, room.x + 150, room.z + room.depth / 2);
  const saved = savedRevision(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await expect(page.locator('[data-drop]')).toHaveAttribute('data-drop', 'valid');
  await capture(page, info, 'placement-drag-ghost', false);
  await page.mouse.up();
  const dragged = (await (await saved).json()).home as HomeProject;
  const moved = dragged.scene!.instances.find(item => item.id === sofa.id)!;
  expect(moved.rotation).toBe(270);
  expect(moved.position[0]).toBe(room.x + sofa.dimensions[2] / 2);
  expect(moved.position[2] % 50).toBe(0);
  await expect(page.getByText(/Change saved/)).toBeVisible();

  const nudged = savedRevision(page);
  await page.getByRole('heading', { name: 'Make it precise' }).click();
  await page.keyboard.press('Shift+ArrowDown');
  const afterNudge = ((await (await nudged).json()).home as HomeProject).scene!.instances.find(item => item.id === sofa.id)!;
  expect(afterNudge.position[2]).toBe(moved.position[2] + 10);

  await page.getByLabel('Design area', { exact: true }).selectOption('room:' + room.id);
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const arranged = savedRevision(page);
  await page.getByRole('button', { name: 'Arrange for me', exact: true }).click();
  expect((await arranged).ok()).toBe(true);
  const another = savedRevision(page);
  await page.getByRole('button', { name: 'Try another arrangement', exact: true }).click();
  const final = (await (await another).json()).home as HomeProject;
  expect(final.revisions.length).toBe(home.revisions.length + 4);
  expect(final.scene!.walls).toEqual(home.scene!.walls);
  await capture(page, info, 'placement-arranged', false);
  await accessible(page);
});
