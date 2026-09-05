import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('workspace launches the separate demo; returning preserves workspace styling', async ({ page, context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:3100' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Open house demo' });
  await expect(link).toHaveAttribute('href', '/studio');
  await expect(link).toHaveAttribute('target', '_blank');
  const heading = page.getByRole('heading', { name: 'Turn client changes into clear drafts.' });
  const readStyle = () => heading.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, font: s.fontFamily, size: s.fontSize }; });
  const before = await readStyle();
  const popupReady = page.waitForEvent('popup'); await link.click(); const demo = await popupReady;
  await expect(demo.getByRole('heading', { name: 'House studio', exact: true })).toBeVisible();
  await expect(demo.getByRole('region', { name: 'House preview' }).getByRole('status')).toHaveText('Pascal 3D ready');
  await demo.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(demo.getByRole('region', { name: 'House preview' }).getByRole('img')).toBeVisible();
  await demo.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  const returned = demo.getByRole('heading', { name: 'Turn client changes into clear drafts.' });
  await expect(returned).toBeVisible();
  expect(await returned.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, font: s.fontFamily, size: s.fontSize }; })).toEqual(before);
  expect(await readStyle()).toEqual(before);
  expect((await new AxeBuilder({ page: demo }).analyze()).violations).toEqual([]);
  expect(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await demo.close();
});
