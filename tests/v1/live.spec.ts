import { homeTemplates } from '@vibeestimate/scene-core';
import type { HomeProject } from '../../backend/src/home-types';
import { test, expect, capture, accessible, geometry } from './helpers';
import { createHome, generate, selectArea, designJobs } from './ui';
import { openSharedHome, askInRoom, agreeAndDownload } from './shared-ui';

// Preserve receipts on failed rehearsals too. Checking a job never redispatches
// it; bearer values remain only in memory and are excluded from attachments.
const observed = new WeakMap<object, Map<string, { endpoint: string; authorization: string }>>();
test.beforeEach(async ({ context }) => {
  const jobs = new Map<string, { endpoint: string; authorization: string }>();
  observed.set(context, jobs);
  context.on('request', request => {
    if (request.method() !== 'POST') return;
    const url = new URL(request.url());
    if (!/\/generate$|\/home\/agreements$/.test(url.pathname) && !(/\/home\/messages$/.test(url.pathname) && request.postDataJSON()?.askAssistant)) return;
    const requestId = request.postDataJSON()?.requestId;
    if (typeof requestId === 'string') jobs.set(requestId, { endpoint: request.url().replace(/\/(?:generate|agreements|messages)$/, '/jobs/' + requestId), authorization: request.headers().authorization });
  });
});
test.afterEach(async ({ context, request }, info) => {
  const receipts: unknown[] = [];
  for (const [requestId, job] of observed.get(context) ?? []) {
    try {
      const response = await request.get(job.endpoint, { headers: { Authorization: job.authorization }, timeout: 10000 });
      const result = response.ok() ? (await response.json()).job : undefined;
      receipts.push({ requestId, status: result?.status ?? 'not-confirmed', attemptsUsed: result?.attemptsUsed ?? null, model: result?.model, errorCode: result?.error?.code });
    } catch { receipts.push({ requestId, status: 'not-confirmed', attemptsUsed: null }); }
  }
  await info.attach('all-submitted-live-receipts', { body: JSON.stringify({ submittedJobs: receipts.length, receipts }, null, 2), contentType: 'application/json' });
});

/** Five explicit jobs, at most two reserved provider attempts per job. No retries. */
test('Live Gemini — three real homes, one client-selected edit and an agreed shared draft', async ({ page, request }, info) => {
  test.setTimeout(720000);
  const health = await (await request.get('/health')).json();
  expect(health).toMatchObject({ runtime: 'local', aiProvider: 'gemini', auth: 'emulator', storageConnection: 'emulator' });
  let submittedJobs = 0;
  page.context().on('request', request => {
    if (request.method() !== 'POST') return;
    if (/\/generate$|\/home\/agreements$/.test(request.url()) || /\/home\/messages$/.test(request.url()) && request.postDataJSON()?.askAssistant) submittedJobs++;
  });
  const templates = [...homeTemplates.filter(item => item.id !== 'family-home'), homeTemplates.find(item => item.id === 'family-home')!];
  let family: HomeProject | undefined;
  for (const template of templates) {
    const original = await createHome(page, template.id);
    const designed = await generate(page, 'Add one warm ceiling pendant in the living room and one small side table in an available position. Keep the existing furniture and every wall, door and window.');
    expect(designed.brief?.source).toBe('gemini');
    expect(designed.headRevisionId).not.toBe(original.headRevisionId);
    const added = designed.scene!.instances.filter(item => !original.scene!.instances.some(before => before.id === item.id));
    expect(added.some(item => item.catalogId === 'pendant')).toBe(true);
    expect(added.some(item => !item.light)).toBe(true);
    const actual = await geometry(page);
    for (const item of added) expect(actual.entities[item.id]).toBeTruthy();
    await capture(page, info, template.id + '-live-gemini');
    if (template.id === 'family-home') family = designed;
  }
  expect(submittedJobs).toBe(3);
  const { clientPage, separateIdentities } = await openSharedHome(page);
  const wall = family!.scene!.walls.find(item => item.frontRoomId === 'living' && item.backRoomId)!;
  await selectArea(clientPage, 'surface:' + wall.id + ':front');
  const changed = await askInRoom(clientPage, 'Make only this selected wall face warm clay. Keep all other surfaces and furniture unchanged.');
  expect(changed.home.brief?.source).toBe('gemini');
  const nextWall = changed.home.scene!.walls.find(item => item.id === wall.id)!;
  expect(nextWall.frontMaterialId).not.toBe(wall.frontMaterialId);
  expect(nextWall.backMaterialId).toBe(wall.backMaterialId);
  await capture(clientPage, info, 'live-client-selected-wall');
  await expect.poll(async () => (await geometry(page)).wallFaces[wall.id].front.color).toBe(changed.home.scene!.materials.find(item => item.id === nextWall.frontMaterialId)!.color);
  const agreed = await agreeAndDownload(page, clientPage, info);
  expect(agreed.agreements[0].provider).toBe('gemini');
  expect(agreed.agreements[0].revisionId).toBe(changed.home.headRevisionId);
  expect(submittedJobs).toBe(5);
  const jobs = [...designJobs(page), changed.job, agreed.verificationJob];
  expect(jobs).toHaveLength(5);
  for (const job of jobs) { expect(job.status).toBe('complete'); expect(job.attemptsUsed).toBeGreaterThanOrEqual(1); expect(job.attemptsUsed).toBeLessThanOrEqual(2); }
  await capture(clientPage, info, 'live-shared-agreement-library');
  await accessible(clientPage);
  await page.bringToFront();
  await page.reload();
  await geometry(page);
  await page.getByRole('tab', { name: 'Together', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
  await capture(page, info, 'live-agreement-reopened');
  await info.attach('live-model-evidence', { body: JSON.stringify({ provider: 'gemini', explicitJobBudget: 5, providerAttemptBudget: 10, submittedJobs, reservedAttempts: jobs.reduce((sum, job) => sum + job.attemptsUsed, 0), separateIdentities, assistantProfileSource: 'configured-default', jobs, agreement: agreed.agreements[0] }, null, 2), contentType: 'application/json' });
  await clientPage.close();
  await clientPage.video()?.saveAs(info.outputPath('live-client.webm'));
});
