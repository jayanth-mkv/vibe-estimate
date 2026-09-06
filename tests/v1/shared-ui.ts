import { expect, type Page, type TestInfo } from '@playwright/test';
import { geometry, downloadedText } from './helpers';
import type { HomeProject } from '../../backend/src/home-types';

const subject = (authorization: string) => JSON.parse(Buffer.from(authorization.replace(/^Bearer /, '').split('.')[1], 'base64url').toString()).sub as string;

export async function openSharedHome(page: Page) {
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Create design assistant', exact: true }).click();
  await expect(page.getByText('Assistant created', { exact: true })).toBeVisible();
  const creating = page.waitForResponse(response => /\/api\/homes\/[^/]+\/room$/.test(response.url()) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create shared room', exact: true }).click();
  const created = await creating;
  expect(created.ok()).toBe(true);
  const shared = await created.json();
  const designerUid = subject(created.request().headers().authorization);
  await expect(page).toHaveURL(new RegExp('/rooms/' + shared.room.id + '$'));
  await geometry(page);
  await page.getByRole('tab', { name: 'Together', exact: true }).click();
  await page.getByRole('button', { name: 'Invite client', exact: true }).click();
  await page.getByRole('button', { name: 'Create invite link', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open client demo', exact: true })).toBeVisible();
  const joined = page.context().waitForEvent('response', { predicate: response => /\/api\/rooms\/[^/]+\/join$/.test(response.url()) && response.request().method() === 'POST' });
  const opened = page.context().waitForEvent('page');
  await page.getByRole('link', { name: 'Open client demo', exact: true }).click();
  const clientPage = await opened;
  const joining = await joined;
  expect(joining.ok()).toBe(true);
  const clientUid = subject(joining.request().headers().authorization);
  expect(clientUid).not.toBe(designerUid);
  await expect.poll(() => new URL(clientPage.url()).hash).toBe('');
  await geometry(clientPage);
  await clientPage.getByRole('tab', { name: 'Together', exact: true }).click();
  await expect(clientPage.getByText('Client view', { exact: true })).toBeVisible();
  await page.bringToFront();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { clientPage, roomId: shared.room.id as string, separateIdentities: true };
}

export async function askInRoom(page: Page, prompt: string) {
  await page.bringToFront();
  await page.getByRole('tab', { name: 'Together', exact: true }).click();
  await page.getByLabel('Message', { exact: true }).fill(prompt);
  const response = page.waitForResponse(result => /\/home\/messages$/.test(result.url()) && result.request().postDataJSON()?.askAssistant === true, { timeout: 90000 });
  await page.getByRole('button', { name: 'Ask assistant', exact: true }).click();
  const submitted = await response;
  expect(submitted.ok()).toBe(true);
  const result = await submitted.json();
  expect(result.job?.status).toBe('complete');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await geometry(page);
  return result as { home: HomeProject; job: { status: string; attemptsUsed: number; model: string; requestId: string } };
}

export async function agreeAndDownload(designer: Page, client: Page, info: TestInfo) {
  await client.bringToFront();
  await client.getByRole('tab', { name: 'Together', exact: true }).click();
  await expect(client.getByRole('button', { name: 'Accept this design', exact: true })).toBeEnabled();
  await expect(client.getByRole('button', { name: 'Accept this design', exact: true })).toHaveAccessibleDescription(/Design version \d+ · /);
  await client.getByRole('button', { name: 'Accept this design', exact: true }).click();
  await designer.bringToFront();
  await designer.getByRole('tab', { name: 'Together', exact: true }).click();
  await expect(designer.getByRole('button', { name: 'Approve this design', exact: true })).toBeEnabled();
  await expect(designer.getByRole('button', { name: 'Approve this design', exact: true })).toHaveAccessibleDescription(/Design version \d+ · /);
  await designer.getByRole('button', { name: 'Approve this design', exact: true }).click();
  const producing = designer.waitForResponse(response => /\/home\/agreements$/.test(response.url()) && response.request().method() === 'POST', { timeout: 90000 });
  await designer.getByRole('button', { name: 'Generate draft agreement', exact: true }).click();
  const response = await producing;
  expect(response.ok()).toBe(true);
  const saved = await response.json();
  const jobResponse = await designer.request.get(response.url().replace(/\/agreements$/, '/jobs/' + response.request().postDataJSON().requestId), { headers: { Authorization: response.request().headers().authorization } });
  expect(jobResponse.ok()).toBe(true);
  const verificationJob = (await jobResponse.json()).job;
  expect(saved.agreements).toHaveLength(1);
  expect(saved.agreements[0].status).toBe('draft');
  const versionIndex = saved.home.revisions.findIndex((revision: { id: string }) => revision.id === saved.agreements[0].revisionId);
  const agreedVersion = `Design version ${versionIndex + 1} · ${saved.home.revisions[versionIndex].title}`;
  await expect(designer.locator('.home-agreed-version')).toHaveText(agreedVersion);
  await expect(designer.getByRole('heading', { name: 'Shared agreement library', exact: true })).toBeVisible();
  await expect(designer.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
  const markdown = await downloadedText(designer, 'Download agreement', info, 'designer-draft-agreement.md');
  expect(markdown).toContain(saved.home.headRevisionId);
  expect(markdown).toContain('Homeowner design acceptance');
  expect(markdown).toContain('Designer design approval');
  expect(markdown.toLowerCase()).toContain('draft');
  await client.bringToFront();
  await expect(client.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
  await expect(client.locator('.home-agreed-version')).toHaveText(agreedVersion);
  const clientText = await downloadedText(client, 'Download agreement', info, 'client-draft-agreement.md');
  expect(clientText).toBe(markdown);
  return { ...saved, verificationJob };
}
