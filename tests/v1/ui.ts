import { expect, type Page } from '@playwright/test';
import type { HomeProject } from '../../backend/src/home-types';
import { geometry } from './helpers';
import { homeTemplates } from '@vibeestimate/scene-core';
export type DesignJobEvidence = { requestId: string; status: string; attemptsUsed: number; model?: string };
const jobs = new WeakMap<Page, DesignJobEvidence[]>();
export const designJobs = (page: Page) => jobs.get(page) ?? [];

/** Every narrated step activates the same accessible control as the customer. */
export async function createHome(page: Page, templateId = 'family-home') {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const response = page.waitForResponse(result => result.url().endsWith('/template') && result.request().method() === 'POST');
  const template = homeTemplates.find(item => item.id === templateId)!;
  await page.getByRole('button', { name: 'Choose ' + template.name, exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const home = (await saved.json()).home as HomeProject;
  await expect(page).toHaveURL(new RegExp('/projects/' + home.id + '$'));
  await geometry(page);
  return home;
}

export async function generate(page: Page, prompt: string): Promise<HomeProject> {
  await page.getByLabel('Describe your design', { exact: true }).fill(prompt);
  const response = page.waitForResponse(result => result.url().endsWith('/generate') && result.request().method() === 'POST', { timeout: 90000 });
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  const submitted = await response;
  expect(submitted.ok()).toBe(true);
  const initial = await submitted.json();
  const headers = { Authorization: submitted.request().headers().authorization };
  const endpoint = submitted.url().replace(/\/generate$/, '/jobs/' + submitted.request().postDataJSON().requestId);
  let result = initial;
  await expect.poll(async () => {
    if (result.job?.status !== 'complete') {
      const current = await page.request.get(endpoint, { headers });
      expect(current.ok()).toBe(true);
      result = await current.json();
    }
    if (['failed', 'unknown', 'cancelled', 'conflict'].includes(result.job?.status)) throw new Error('Generation ended without a published design: ' + result.job.status + ', ' + (result.job.error?.code ?? 'no error code'));
    return result.job?.status;
  }, { timeout: 150000, intervals: [300, 500, 1000] }).toBe('complete');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  jobs.set(page, [...designJobs(page), { requestId: result.job.requestId, status: result.job.status, attemptsUsed: result.job.attemptsUsed, model: result.job.model }]);
  await geometry(page);
  await expect.poll(() => page.evaluate(() => Object.keys(window.__house!.inspect().lights).length)).toBe(result.home.scene.instances.filter((item: { light?: unknown }) => item.light).length);
  return result.home;
}

export async function selectArea(page: Page, value: string) {
  if (value.startsWith('surface:') || value.startsWith('object:')) {
    const [, entityId, face] = value.split(':');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Edit selection', { exact: true }).selectOption(value.startsWith('surface:') ? face + ':' + entityId : value);
    await page.getByRole('tab', { name: 'Design', exact: true }).click();
    return;
  }
  await page.getByLabel('Design area', { exact: true }).selectOption(value);
}
