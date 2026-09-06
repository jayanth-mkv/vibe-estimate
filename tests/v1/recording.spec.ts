import { test, expect, fixtureHealth, geometry, capture, origin } from './helpers';
import { createHome, generate } from './ui';
import { askInRoom, agreeAndDownload } from './shared-ui';
import { installRoleCapture, synchronizeCapture } from './video-capture';
import type { Response } from '@playwright/test';

const posted = (pathname: string) => (response: Response) => response.url() === origin + pathname && response.request().method() === 'POST';
async function uid(response: Response) {
  const value = await response.request().headerValue('authorization');
  if (!value) throw new Error('A distinct authenticated identity is required.');
  return JSON.parse(Buffer.from(value.slice(7).split('.')[1], 'base64url').toString()).sub as string;
}

test('Synchronized designer and homeowner — complete fixture rehearsal with visible clicks', async ({ page, browser, request }, info) => {
  await fixtureHealth(request); // Before identities, edits, jobs or recordings.
  const external: string[] = [];
  const clientContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', recordVideo: { dir: info.outputPath('client-video'), size: { width: 390, height: 844 } } });
  clientContext.on('page', current => current.on('pageerror', () => external.push('Homeowner browser error')));
  await clientContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['data:', 'blob:'].includes(url.protocol) || url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && ['3100', '8181', '9299', '8285'].includes(url.port)) return route.continue();
    external.push('External request blocked'); return route.abort('blockedbyclient');
  });
  await installRoleCapture(page.context(), 'Designer');
  await installRoleCapture(clientContext, 'Homeowner');
  const client = await clientContext.newPage();
  let recording: Awaited<ReturnType<typeof synchronizeCapture>> | undefined;
  let complete = false;
  try {
    const listing = page.waitForResponse(response => response.url().endsWith('/api/homes') && response.request().method() === 'GET');
    await page.goto('/'); const ownerUid = await uid(await listing);
    await client.goto('/join');
    recording = await synchronizeCapture(page, client, info, 'fixture');
    recording.mark('Designer creates a family home; homeowner waits to join.');
    const original = await createHome(page, 'family-home');
    const furnished = await generate(page, 'Add warm ceiling lights throughout the home.');
    expect(furnished.brief?.source).toBe('fixture');
    expect(furnished.scene!.instances.filter(item => item.light).length).toBeGreaterThan(original.scene!.instances.filter(item => item.light).length);
    recording.mark('Fixture assistant adds measured lighting; both recorded streams are already running.');
    await capture(page, info, 'designer-furnished-home');
    await page.getByRole('tab', { name: 'Share', exact: true }).click();
    await page.getByRole('button', { name: 'Create design assistant', exact: true }).click();
    await expect(page.getByText('Assistant created', { exact: true })).toBeVisible();
    const creating = page.waitForResponse(posted('/api/homes/' + original.id + '/room'));
    await page.getByRole('button', { name: 'Create shared room', exact: true }).click();
    const created = await creating; expect(created.ok()).toBe(true);
    const shared = await created.json(), prefix = '/api/rooms/' + shared.room.id + '/home';
    await expect(page).toHaveURL(origin + '/rooms/' + shared.room.id);
    await geometry(page);
    await page.getByRole('tab', { name: 'Together', exact: true }).click();
    await page.getByRole('button', { name: 'Invite client', exact: true }).click();
    await page.getByRole('button', { name: 'Create invite link', exact: true }).click();
    const output = page.getByLabel('Room code', { exact: true });
    await expect.poll(async () => Boolean((await output.textContent())?.trim())).toBe(true);
    expect(await output.evaluate(element => getComputedStyle(element).color === 'rgba(0, 0, 0, 0)')).toBe(true);
    expect(await page.getByRole('img', { name: 'Scan to join the project room', exact: true }).evaluate(element => getComputedStyle(element).opacity)).toBe('0');
    const code = (await output.textContent())!.trim();
    await page.keyboard.press('Escape');
    await client.bringToFront();
    const input = client.getByLabel('Room code', { exact: true });
    expect(await input.evaluate(element => getComputedStyle(element).color === 'rgba(0, 0, 0, 0)' && getComputedStyle(element).caretColor === 'rgba(0, 0, 0, 0)')).toBe(true);
    try { await input.fill(code); } catch { throw new Error('Invitation entry failed; credential withheld.'); }
    const joining = client.waitForResponse(posted('/api/rooms/join'));
    await client.getByRole('button', { name: 'Join room', exact: true }).click();
    const joined = await joining; expect(joined.ok()).toBe(true); expect(await uid(joined)).not.toBe(ownerUid);
    await geometry(client); expect(new URL(client.url()).hash).toBe('');
    recording.mark('Distinct homeowner joins the same saved home.');
    for (const [author, reader, message] of [[page, client, 'The family home is ready. Shall we make the living room warmer?'], [client, page, 'Yes, please. I would like a warm clay finish on the selected living-room wall.']] as const) {
      await author.bringToFront();
      await author.getByRole('tab', { name: 'Together', exact: true }).click();
      await author.getByLabel('Message', { exact: true }).fill(message);
      const sending = author.waitForResponse(posted(prefix + '/messages'));
      await author.getByRole('button', { name: 'Send message', exact: true }).click();
      expect((await sending).ok()).toBe(true);
      await reader.bringToFront(); await expect(reader.getByText(message, { exact: true })).toBeVisible();
    }
    recording.mark('Both people send real messages and see each other’s responses.');
    const wall = furnished.scene!.walls.find(item => item.frontRoomId === 'living' && item.backRoomId)!;
    await client.bringToFront();
    await client.getByRole('tab', { name: 'Edit', exact: true }).click();
    await client.getByLabel('Edit selection', { exact: true }).selectOption('front:' + wall.id);
    const refined = await askInRoom(client, 'Make this selected wall face warm clay.');
    expect(refined.home.brief?.source).toBe('fixture');
    const nextWall = refined.home.scene!.walls.find(item => item.id === wall.id)!;
    expect(nextWall.frontMaterialId).not.toBe(wall.frontMaterialId); expect(nextWall.backMaterialId).toBe(wall.backMaterialId);
    await expect.poll(async () => (await geometry(page)).wallFaces[wall.id].front.color).toBe(refined.home.scene!.materials.find(item => item.id === nextWall.frontMaterialId)!.color);
    recording.mark('A selected-face assistant edit updates both views while preserving the other face.');
    const agreed = await agreeAndDownload(page, client, info);
    expect(agreed.agreements[0].provider).toBe('fixture'); expect(agreed.agreements[0].status).toBe('draft');
    recording.mark('Homeowner accepts; designer approves; both download the saved draft agreement.');
    for (const current of [page, client]) {
      await current.bringToFront(); await current.reload(); await geometry(current);
      await current.getByRole('tab', { name: 'Together', exact: true }).click();
      await expect(current.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
      expect(new URL(current.url()).hash).toBe('');
    }
    await capture(page, info, 'designer-saved-agreement'); await capture(client, info, 'homeowner-saved-agreement');
    recording.mark('The shared agreement library reopens for each participant.');
    expect(external).toEqual([]); complete = true;
  } finally {
    if (recording) await recording.finish(complete);
    await clientContext.close();
  }
});
