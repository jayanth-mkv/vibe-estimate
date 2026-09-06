import type { HomeJob, HomeProject } from '../../backend/src/home-types';
import { test, expect, fixtureHealth, geometry, capture, origin } from './helpers';
import { createHome, selectArea } from './ui';

type Result = { home: HomeProject; job: HomeJob };
const lightingPrompt = 'Add warm ceiling lights throughout the home.';
const generationResponse = (url: string, method: string) => url.endsWith('/generate') && method === 'POST';

test.beforeEach(async ({ request }) => fixtureHealth(request));

test('Recovery — a lost successful response reloads its saved result without redispatching the design', async ({ page }, info) => {
  const initial = await createHome(page);
  let generationCalls = 0, completed: Result | undefined;
  page.on('request', request => { if (generationResponse(request.url(), request.method())) generationCalls++; });
  await page.route('**/api/homes/' + initial.id + '/generate', async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    completed = await response.json() as Result;
    expect(completed.job.status).toBe('complete');
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RESPONSE_LOST', message: 'The response was interrupted. Check the saved request before trying again.' } }) });
  }, { times: 1 });
  await page.getByLabel('Describe your design', { exact: true }).fill(lightingPrompt);
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('interrupted');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  const rendered = await geometry(page);
  expect(Object.keys(rendered.lights)).toHaveLength(completed!.home.scene!.instances.filter(item => item.light).length);
  await expect(page.getByLabel('Describe your design', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('home-design:')).length)).toBe(0);
  await expect(page.getByRole('button', { name: 'Generate design', exact: true })).toBeDisabled();
  expect(generationCalls).toBe(1);
  await capture(page, info, 'lost-response-saved-result-reopened');
  await info.attach('lost-response-proof', { body: JSON.stringify({ actualFixtureJob: completed!.job.requestId, actualReservedAttempts: completed!.job.attemptsUsed, publishedRevision: completed!.home.headRevisionId, browserGenerationRequests: generationCalls, interruptedAt: 'response after actual publication' }), contentType: 'application/json' });
});

test('Recovery — a rejected design can be deliberately retried with a corrected prompt and selection', async ({ page }, info) => {
  const initial = await createHome(page);
  const before = await geometry(page);
  await page.getByLabel('Describe your design', { exact: true }).fill('Remove the roof and build a second floor.');
  const rejected = page.waitForResponse(response => generationResponse(response.url(), response.request().method()));
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  const first = await rejected, failed = await first.json() as Result;
  expect(failed.job.status).toBe('failed');
  expect(failed.home.headRevisionId).toBe(initial.headRevisionId);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(failed.job.error!.message);
  expect((await geometry(page)).entities).toEqual(before.entities);
  const wall = initial.scene!.walls.find(wall => wall.frontRoomId === 'living' && wall.backRoomId)!;
  const corrected = 'Make this wall warm clay.';
  await selectArea(page, 'surface:' + wall.id + ':front');
  await page.getByLabel('Describe your design', { exact: true }).fill(corrected);
  const retry = page.waitForResponse(response => generationResponse(response.url(), response.request().method()));
  await page.getByRole('button', { name: 'Retry design', exact: true }).click();
  const response = await retry, submitted = response.request().postDataJSON(), saved = await response.json() as Result;
  expect(submitted.prompt).toBe(corrected);
  expect(submitted.selection).toEqual({ kind: 'surface', entityId: wall.id, surface: 'front' });
  expect(submitted.requestId).not.toBe(failed.job.requestId);
  expect(saved.job.status).toBe('complete');
  expect(saved.home.scene!.walls.find(item => item.id === wall.id)!.backMaterialId).toBe(wall.backMaterialId);
  await capture(page, info, 'corrected-explicit-retry');
});

test('Recovery — an ambiguous status survives reload and waits for an explicit new request', async ({ page }, info) => {
  const initial = await createHome(page);
  const endpoint = origin + '/api/homes/' + initial.id;
  let calls = 0, polls = 0, firstRequestId = '', ambiguous: HomeProject | undefined;
  page.on('request', request => { if (generationResponse(request.url(), request.method())) calls++; });
  await page.route(endpoint, async route => { polls++; await route.fulfill({ json: { home: ambiguous ?? initial } }); });
  await page.route(endpoint + '/jobs/*', route => route.fulfill({ json: { home: ambiguous, job: ambiguous!.activeJob } }));
  await page.route(endpoint + '/generate', async route => {
    firstRequestId = route.request().postDataJSON().requestId;
    const now = new Date().toISOString();
    const job: HomeJob = { requestId: firstRequestId, kind: 'generate', baseRevisionId: initial.headRevisionId!, status: 'unknown', phase: 'planning', attemptsUsed: 1, startedAt: now, updatedAt: now, error: { code: 'GENERATION_OUTCOME_UNKNOWN', message: 'The model outcome could not be confirmed. Check this saved request before starting a new one.' } };
    ambiguous = { ...initial, activeJob: job, updatedAt: now };
    await route.fulfill({ json: { home: ambiguous, job } });
  }, { times: 1 });
  await page.getByLabel('Describe your design', { exact: true }).fill(lightingPrompt);
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be confirmed');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await geometry(page);
  await expect(page.getByLabel('Describe your design', { exact: true })).toHaveValue(lightingPrompt);
  await expect(page.getByRole('button', { name: 'Generate design', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start a new design request', exact: true })).toBeEnabled();
  const observedPolls = polls;
  await expect.poll(() => polls).toBeGreaterThan(observedPolls);
  expect(calls).toBe(1);
  await capture(page, info, 'ambiguous-request-after-reload');
  await page.unroute(endpoint);
  await page.unroute(endpoint + '/jobs/*');
  const response = page.waitForResponse(result => generationResponse(result.url(), result.request().method()));
  await page.getByRole('button', { name: 'Start a new design request', exact: true }).click();
  const saved = await response;
  expect(saved.request().postDataJSON().requestId).not.toBe(firstRequestId);
  expect((await saved.json()).job.status).toBe('complete');
  expect(calls).toBe(2);
  await capture(page, info, 'deliberate-new-design-after-unknown');
  await info.attach('unknown-boundary-proof', { body: JSON.stringify({ failure: 'simulated unknown API state; no model dispatch', requestsBeforeExplicitChoice: 1, requestsAfterExplicitChoice: calls, backendUnknownReservationProof: 'backend/tests/homes-api.test.ts' }), contentType: 'application/json' });
});

test('Recovery — Finish saving resumes the same request after reload without another generation', async ({ page }, info) => {
  const initial = await createHome(page);
  const endpoint = origin + '/api/homes/' + initial.id;
  let generationCalls = 0, resumeCalls = 0, completed: Result | undefined, pending: HomeProject | undefined;
  page.on('request', request => { if (generationResponse(request.url(), request.method())) generationCalls++; });
  await page.route(endpoint, route => route.fulfill({ json: { home: pending ?? initial } }));
  await page.route(endpoint + '/jobs/*', route => route.fulfill({ json: { home: pending, job: pending!.activeJob } }));
  await page.route(endpoint + '/generate', async route => {
    const result = await route.fetch();
    expect(result.ok()).toBe(true);
    completed = await result.json() as Result;
    expect(completed.job.status).toBe('complete');
    const job = { ...completed.job, status: 'save_pending' as const, phase: 'saving' as const };
    pending = { ...initial, updatedAt: completed.home.updatedAt, activeJob: job };
    await route.fulfill({ json: { home: pending, job } });
  }, { times: 1 });
  await page.route(endpoint + '/jobs/*/resume', async route => {
    resumeCalls++;
    expect(route.request().postDataJSON()).toEqual({ requestId: completed!.job.requestId });
    await page.unroute(endpoint);
    await page.unroute(endpoint + '/jobs/*');
    const saved = await route.fetch();
    expect(saved.ok()).toBe(true);
    expect((await saved.json()).job.status).toBe('complete');
    await route.fulfill({ response: saved });
  });
  await page.getByLabel('Describe your design', { exact: true }).fill(lightingPrompt);
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish saving', exact: true })).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await geometry(page);
  await expect(page.getByRole('button', { name: 'Finish saving', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Generate design', exact: true })).toBeDisabled();
  expect(generationCalls).toBe(1);
  await page.getByRole('button', { name: 'Finish saving', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(Object.keys((await geometry(page)).lights)).toHaveLength(completed!.home.scene!.instances.filter(item => item.light).length);
  await expect(page.getByLabel('Describe your design', { exact: true })).toHaveValue('');
  expect(resumeCalls).toBe(1);
  expect(generationCalls).toBe(1);
  await capture(page, info, 'same-request-save-finished');
  await info.attach('save-boundary-proof', { body: JSON.stringify({ failure: 'simulated save_pending API projection of actual completed fixture request', browserGenerationRequests: generationCalls, actualReservedAttempts: completed!.job.attemptsUsed, resumeRequests: resumeCalls, backendDurableSaveProof: 'backend/tests/homes-api.test.ts' }), contentType: 'application/json' });
});
