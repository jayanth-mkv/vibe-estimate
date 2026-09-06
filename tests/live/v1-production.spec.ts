import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test as base, expect, type BrowserContext, type Page, type Request, type Response, type APIRequestContext, type TestInfo } from '@playwright/test';
import { homeTemplates } from '@vibeestimate/scene-core';
import type { HomeProject, HomeJob } from '../../backend/src/home-types';
import { v1ProductionHealth } from '../../scripts/v1-production-target.mjs';
// These are renderer/accessibility utilities only. The fixture test hooks and
// loopback health helpers in that module are never used by this production test.
import { geometry, accessible } from '../v1/helpers';
import { installRoleCapture, synchronizeCapture } from '../v1/video-capture';

const evidence = process.env.PRODUCTION_EVIDENCE_DIR!;
const target = JSON.parse(fs.readFileSync(path.join(evidence, 'v1-target.json'), 'utf8')) as { origin: string; expectedGitRevision: string; firebaseProjectId: string };
type Saved = { home: HomeProject; job: HomeJob };
type Headers = { Authorization: string };
const responseFor = (pathname: string, method = 'POST') => (response: Response) => response.url() === target.origin + pathname && response.request().method() === method;

async function safeApi(request: APIRequestContext, method: 'get' | 'post', pathname: string, headers?: Headers, data?: object) {
  try { return await request[method](target.origin + pathname, { ...(headers ? { headers } : {}), ...(data ? { data } : {}) }); }
  catch { throw new Error('The authorized API request failed; credentials and request details are withheld.'); }
}
async function identity(response: Response) {
  let authorization = '', claims: { sub?: string; aud?: string; iss?: string; firebase?: { sign_in_provider?: string } } = {};
  try { authorization = await response.request().headerValue('authorization') ?? ''; claims = JSON.parse(Buffer.from(authorization.slice(7).split('.')[1], 'base64url').toString()); }
  catch { throw new Error('A real Firebase guest identity could not be verified; credentials are withheld.'); }
  expect(Boolean(authorization.startsWith('Bearer ') && claims.sub && claims.aud === target.firebaseProjectId && claims.iss === 'https://securetoken.google.com/' + target.firebaseProjectId && claims.firebase?.sign_in_provider === 'anonymous')).toBe(true);
  return { headers: { Authorization: authorization }, uid: claims.sub! };
}

class RehearsalGuard {
  submitted = 0;
  blocked = 0;
  pageErrors = 0;
  private readonly browserErrors: { name: string; message: string; stack: string }[] = [];
  private nextPath: string | null = null;
  private readonly receipts = new Map<Request, Record<string, unknown>>();
  private readonly receiving: Promise<void>[] = [];
  authorize(pathname: string) { expect(this.nextPath).toBeNull(); expect(this.submitted).toBeLessThan(3); this.nextPath = pathname; }
  async evidence(info: TestInfo) {
    await Promise.allSettled(this.receiving);
    await info.attach('production-model-receipts', { contentType: 'application/json', body: JSON.stringify({ submittedJobs: this.submitted, allowedJobs: 3, allowedReservedAttempts: 6, receipts: [...this.receipts.values()] }) });
    await info.attach('production-browser-errors', { contentType: 'application/json', body: JSON.stringify(this.browserErrors) });
  }
  async install(context: BrowserContext) {
    // Installed before pages exist: codes and QR tokens never enter video pixels.
    await context.addInitScript(() => {
      const install = () => {
        if (!document.documentElement || document.getElementById('v1-private-invitation')) return;
        const style = document.createElement('style'); style.id = 'v1-private-invitation';
        style.textContent = '[aria-label="Room code"],input#join-code{color:transparent!important;text-shadow:none!important;caret-color:transparent!important} [aria-label="Room code"]::selection,input#join-code::selection{color:transparent!important;background:transparent!important} [aria-label="Scan to join the project room"]{opacity:0!important}';
        document.documentElement.append(style);
      };
      install(); new MutationObserver(install).observe(document, { childList: true, subtree: true });
    });
    context.on('page', page => page.on('pageerror', error => {
      this.pageErrors++;
      // This report is private, but still remove URLs, bearer strings and JWTs.
      // Keep exception text so a failed guard can be diagnosed without another
      // paid request. Browser errors are never turned into a passing result.
      const sanitize = (value: string) => value.slice(0, 8192).replace(/https?:\/\/[^\s)]+/g, '[URL omitted]').replace(/Bearer\s+\S+/gi, '[authorization omitted]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token omitted]');
      this.browserErrors.push({ name: error.name, message: sanitize(error.message), stack: sanitize(error.stack ?? '') });
    }));
    context.on('response', response => {
      const receipt = this.receipts.get(response.request());
      if (!receipt) return;
      this.receiving.push((async () => {
        receipt.httpStatus = response.status();
        try {
          const body = await response.json();
          const job = body.job ?? body.home?.activeJob;
          receipt.response = 'received';
          if (body.error?.code) receipt.errorCode = body.error.code;
          if (job) receipt.job = { requestId: job.requestId, status: job.status, attemptsUsed: job.attemptsUsed, model: job.model, resultRevisionId: job.resultRevisionId };
          if (body.agreements) receipt.agreements = body.agreements.map((item: { id: string; revisionId: string; provider: string; status: string }) => ({ id: item.id, revisionId: item.revisionId, provider: item.provider, status: item.status }));
        } catch { receipt.response = 'unavailable'; }
      })());
    });
    const allowed = new Set([target.origin, 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com', 'https://apis.google.com', `https://${target.firebaseProjectId}.firebaseapp.com`]);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['data:', 'blob:'].includes(url.protocol) && !allowed.has(url.origin)) { this.blocked++; return route.abort('blockedbyclient'); }
      if (url.origin !== target.origin || request.method() !== 'POST') return route.continue();
      const pathname = url.pathname;
      const generated = /^\/api\/(?:homes\/[^/]+|rooms\/[^/]+\/home)\/generate$/.test(pathname)
        || /^\/api\/rooms\/[^/]+\/home\/agreements$/.test(pathname)
        || /^\/api\/rooms\/[^/]+\/home\/messages$/.test(pathname) && request.postDataJSON()?.askAssistant === true;
      const otherModel = /\/analyze$|\/summary$|\/observer$/.test(pathname) || /^\/api\/rooms\/[^/]+\/messages$/.test(pathname) || /^\/internal\//.test(pathname);
      if (!generated && !otherModel) return route.continue();
      if (generated && pathname === this.nextPath && this.submitted < 3) {
        this.nextPath = null; this.submitted++;
        this.receipts.set(request, { pathname, requestId: request.postDataJSON()?.requestId, response: 'pending' });
        return route.continue();
      }
      this.blocked++;
      return route.fulfill({ status: 429, json: { error: { code: 'REHEARSAL_CALL_BUDGET', message: 'This rehearsal did not authorize another model request.' } } });
    });
  }
}

const test = base.extend<{ guard: RehearsalGuard }>({
  guard: [async ({ context }, use, info) => { const guard = new RehearsalGuard(); await guard.install(context); try { await use(guard); } finally { await guard.evidence(info); } expect(guard.blocked).toBe(0); expect(guard.pageErrors).toBe(0); }, { auto: true }],
});
test.beforeEach(async ({ request }) => {
  const response = await safeApi(request, 'get', '/health');
  expect(response.status()).toBe(200);
  expect(v1ProductionHealth(await response.json(), target.expectedGitRevision), 'The exact deployed Git revision must match before creating any identity or saved home.').toBe(true);
});

async function freshWorkspace(page: Page) {
  const listing = page.waitForResponse(responseFor('/api/homes', 'GET'));
  await page.goto('/');
  const response = await listing;
  expect(response.ok()).toBe(true);
  expect((await response.json()).homes).toHaveLength(0);
  return identity(response);
}
async function createHome(page: Page, templateId = 'family-home') {
  if (new URL(page.url()).pathname !== '/') await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const chosen = page.waitForResponse(response => /\/api\/homes\/[^/]+\/template$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Choose ' + homeTemplates.find(template => template.id === templateId)!.name, exact: true }).click();
  const response = await chosen;
  expect(response.ok()).toBe(true);
  const home = (await response.json()).home as HomeProject;
  await geometry(page);
  return home;
}
async function capture(page: Page, info: TestInfo, filename: string) {
  expect(new URL(page.url()).hash === '', 'No invitation fragment may remain in captured state.').toBe(true);
  await info.attach(filename + '-actual-geometry', { body: JSON.stringify(await geometry(page)), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(filename + '.png'), fullPage: true });
}
async function savedJob(response: Response, request: APIRequestContext) {
  const requestId = response.request().postDataJSON().requestId;
  const endpoint = new URL(response.url()).pathname.replace(/\/(?:generate|messages|agreements)$/, '/jobs/' + requestId);
  const headers = (await identity(response)).headers;
  const checking = await safeApi(request, 'get', endpoint, headers);
  expect(checking.ok()).toBe(true);
  const job = (await checking.json()).job as HomeJob;
  expect(job.status).toBe('complete');
  expect(job.attemptsUsed).toBeGreaterThanOrEqual(1);
  expect(job.attemptsUsed).toBeLessThanOrEqual(2);
  return { requestId: job.requestId, status: job.status, attemptsUsed: job.attemptsUsed, model: job.model };
}

test('Production V1 baseline — all three measured homes and access boundaries without model calls', async ({ page, browser, request, guard }, info) => {
  test.setTimeout(360000);
  const owner = await freshWorkspace(page);
  const headers = owner.headers;
  for (const endpoint of ['/api/home-templates', '/api/catalog']) expect((await safeApi(request, 'get', endpoint, headers)).ok()).toBe(true);
  const templates = await (await safeApi(request, 'get', '/api/home-templates', headers)).json();
  expect(templates.templates.map((template: { id: string }) => template.id).sort()).toEqual(homeTemplates.map(template => template.id).sort());
  const homes: HomeProject[] = [];
  for (const template of homeTemplates) {
    const home = await createHome(page, template.id); homes.push(home);
    expect(home.activeJob).toBeNull(); expect(home.brief?.source).toBe('template');
    expect(home.scene!.rooms).toHaveLength(template.document.rooms.length);
    await capture(page, info, 'production-' + template.id + '-authored');
  }
  expect((await safeApi(request, 'get', '/api/homes')).status()).toBe(401);
  const strangerContext = await browser.newContext({ baseURL: target.origin, serviceWorkers: 'block' });
  try {
    await guard.install(strangerContext);
    const stranger = await freshWorkspace(await strangerContext.newPage());
    expect(stranger.uid !== owner.uid).toBe(true);
    for (const home of homes) {
      for (const suffix of ['', '/revisions/' + home.headRevisionId, '/export?revisionId=' + home.headRevisionId]) expect((await safeApi(request, 'get', '/api/homes/' + home.id + suffix, stranger.headers)).status()).toBe(404);
      expect((await safeApi(request, 'post', '/api/homes/' + home.id + '/revisions', stranger.headers, { requestId: randomUUID(), baseRevisionId: home.headRevisionId, selection: { kind: 'surface', entityId: 'living', surface: 'floor' }, patch: { schemaVersion: 2, operations: [{ op: 'setMaterial', entityId: 'living', surface: 'floor', materialId: 'wood-dark' }] } })).status()).toBe(404);
    }
  } finally { await strangerContext.close(); }
  expect(guard.submitted).toBe(0);
  await info.attach('baseline-boundaries', { contentType: 'application/json', body: JSON.stringify({ gitRevision: target.expectedGitRevision, modelJobs: 0, measuredTemplates: homes.map(home => home.templateId), crossUserReadAndWriteDenied: true, freshSyntheticGuests: true }) });
});

test('Production V1 story — Gemini furnishes a home, client refines one face and both leave with their draft agreement', async ({ page, browser, request, guard }, info) => {
  test.setTimeout(720000);
  const clientContext = await browser.newContext({ baseURL: target.origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', recordVideo: { dir: info.outputPath('client-video'), size: { width: 390, height: 844 } } });
  await guard.install(clientContext);
  await installRoleCapture(page.context(), 'Designer');
  await installRoleCapture(clientContext, 'Homeowner');
  const client = await clientContext.newPage();
  let recording: Awaited<ReturnType<typeof synchronizeCapture>> | undefined;
  let complete = false;
  try {
  const owner = await freshWorkspace(page);
  await client.goto('/join');
  recording = await synchronizeCapture(page, client, info, 'gemini', target.expectedGitRevision);
  recording.mark('Designer creates a measured family home; homeowner is ready to join.');
  const original = await createHome(page);
  const generatingPath = '/api/homes/' + original.id + '/generate';
  await page.getByLabel('Describe your design', { exact: true }).fill('Add one warm ceiling pendant in the living room and one small side table in an available position. Keep existing furniture, walls, doors and windows.');
  guard.authorize(generatingPath);
  const generating = page.waitForResponse(responseFor(generatingPath), { timeout: 90000 });
  await page.getByRole('button', { name: 'Generate design', exact: true }).click();
  const generated = await generating;
  expect(generated.ok()).toBe(true);
  const furnished = await generated.json() as Saved;
  expect(furnished.job.status).toBe('complete'); expect(furnished.home.brief?.source).toBe('gemini');
  const additions = furnished.home.scene!.instances.filter(item => !original.scene!.instances.some(before => before.id === item.id));
  expect(additions.some(item => item.catalogId === 'pendant')).toBe(true);
  expect(additions.some(item => !item.light)).toBe(true);
  expect(furnished.home.scene!.walls).toEqual(original.scene!.walls);
  expect(furnished.home.scene!.openings).toEqual(original.scene!.openings);
  const jobs = [await savedJob(generated, request)];
  recording.mark('Gemini has added the requested furniture and light.');
  await capture(page, info, 'gemini-furniture-and-lights');
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Create design assistant', exact: true }).click();
  await expect(page.getByText('Assistant created', { exact: true })).toBeVisible();
  const creating = page.waitForResponse(responseFor('/api/homes/' + original.id + '/room'));
  await page.getByRole('button', { name: 'Create shared room', exact: true }).click();
  const created = await creating; expect(created.ok()).toBe(true);
  const shared = await created.json(), prefix = '/api/rooms/' + shared.room.id + '/home';
  await expect(page).toHaveURL(target.origin + '/rooms/' + shared.room.id);
  await geometry(page);
  await page.getByRole('tab', { name: 'Together', exact: true }).click();
  await page.getByRole('button', { name: 'Invite client', exact: true }).click();
  await page.getByRole('button', { name: 'Create invite link', exact: true }).click();
  const code = page.getByLabel('Room code', { exact: true });
  await expect.poll(async () => Boolean((await code.textContent())?.trim())).toBe(true);
  expect(await code.evaluate(element => getComputedStyle(element).color === 'rgba(0, 0, 0, 0)')).toBe(true);
  expect(await page.getByRole('img', { name: 'Scan to join the project room', exact: true }).evaluate(element => getComputedStyle(element).opacity)).toBe('0');
  const invitationCode = (await code.textContent())!.trim();
  await page.keyboard.press('Escape');
    await client.bringToFront();
    // Redaction is active before filling the actual invitation credential.
    const input = client.getByLabel('Room code', { exact: true });
    expect(await input.evaluate(element => getComputedStyle(element).color === 'rgba(0, 0, 0, 0)' && getComputedStyle(element).caretColor === 'rgba(0, 0, 0, 0)')).toBe(true);
    await input.evaluate(element => { (element as HTMLElement).style.setProperty('color', 'transparent', 'important'); (element as HTMLElement).style.setProperty('caret-color', 'transparent', 'important'); });
    try { await input.fill(invitationCode); }
    catch { throw new Error('The client invitation could not be entered; its credential is withheld.'); }
    const joining = client.waitForResponse(responseFor('/api/rooms/join'));
    await client.getByRole('button', { name: 'Join room', exact: true }).click();
    const joined = await joining; expect(joined.ok()).toBe(true);
    const clientIdentity = await identity(joined);
    expect(clientIdentity.uid !== owner.uid).toBe(true);
    recording.mark('Separate homeowner identity joins the shared home.');
    await geometry(client);
    await expect(client.getByText('Client view', { exact: true })).toBeVisible();
    expect((await safeApi(request, 'get', '/api/homes/' + original.id, clientIdentity.headers)).status()).toBe(404);
    for (const [author, reader, message] of [[page, client, 'I have added a warm living-room pendant and a side table. What would you like to refine?'], [client, page, 'I like the layout. Let us make just the selected living-room wall warmer.']] as const) {
      await author.bringToFront();
      await author.getByRole('tab', { name: 'Together', exact: true }).click();
      await author.getByLabel('Message', { exact: true }).fill(message);
      const sending = author.waitForResponse(responseFor(prefix + '/messages'));
      await author.getByRole('button', { name: 'Send message', exact: true }).click();
      expect((await sending).ok()).toBe(true);
      await reader.bringToFront();
      await expect(reader.getByText(message, { exact: true })).toBeVisible();
    }
    recording.mark('Designer and homeowner exchange ordinary chat messages without model calls.');
    const wall = furnished.home.scene!.walls.find(item => item.frontRoomId === 'living' && item.backRoomId)!;
    await client.bringToFront();
    await client.getByRole('tab', { name: 'Edit', exact: true }).click();
    await client.getByLabel('Edit selection', { exact: true }).selectOption('front:' + wall.id);
    await client.getByRole('tab', { name: 'Together', exact: true }).click();
    await client.getByLabel('Message', { exact: true }).fill('Make only this selected wall face warm clay. Keep all other surfaces and furniture unchanged.');
    guard.authorize(prefix + '/messages');
    const asking = client.waitForResponse(responseFor(prefix + '/messages'), { timeout: 90000 });
    await client.getByRole('button', { name: 'Ask assistant', exact: true }).click();
    const changed = await asking; expect(changed.ok()).toBe(true);
    const refined = await changed.json() as Saved;
    expect(refined.job.status).toBe('complete'); expect(refined.home.brief?.source).toBe('gemini');
    const nextWall = refined.home.scene!.walls.find(item => item.id === wall.id)!;
    expect(nextWall.frontMaterialId).not.toBe(wall.frontMaterialId); expect(nextWall.backMaterialId).toBe(wall.backMaterialId);
    expect(refined.home.scene!.walls.filter(item => item.id !== wall.id)).toEqual(furnished.home.scene!.walls.filter(item => item.id !== wall.id));
    expect(refined.home.scene!.instances).toEqual(furnished.home.scene!.instances);
    jobs.push(await savedJob(changed, request));
    recording.mark('Homeowner asks Gemini to change exactly one selected wall face.');
    await capture(client, info, 'client-selected-wall');
    await expect.poll(async () => (await geometry(page)).wallFaces[wall.id].front.color).toBe(refined.home.scene!.materials.find(material => material.id === nextWall.frontMaterialId)!.color);
    await expect(client.getByRole('button', { name: 'Accept this design', exact: true })).toBeEnabled();
    await client.getByRole('button', { name: 'Accept this design', exact: true }).click();
    await page.bringToFront();
    await expect(page.getByRole('button', { name: 'Approve this design', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Approve this design', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Generate draft agreement', exact: true })).toBeEnabled();
    guard.authorize(prefix + '/agreements');
    const drafting = page.waitForResponse(responseFor(prefix + '/agreements'), { timeout: 90000 });
    await page.getByRole('button', { name: 'Generate draft agreement', exact: true }).click();
    const drafted = await drafting; expect(drafted.ok()).toBe(true);
    const result = await drafted.json();
    expect(result.agreements).toHaveLength(1);
    const agreement = result.agreements[0];
    expect(agreement.provider).toBe('gemini'); expect(agreement.status).toBe('draft'); expect(agreement.revisionId).toBe(refined.home.headRevisionId);
    jobs.push(await savedJob(drafted, request));
    recording.mark('Homeowner acceptance and designer approval produce a saved Gemini draft agreement.');
    for (const [current, filename] of [[page, 'designer-agreement.md'], [client, 'client-agreement.md']] as const) {
      await current.bringToFront();
      await expect(current.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
      const download = current.waitForEvent('download');
      await current.getByRole('button', { name: 'Download agreement', exact: true }).click();
      await (await download).saveAs(info.outputPath(filename));
      const text = fs.readFileSync(info.outputPath(filename), 'utf8');
      expect(text).toContain(refined.home.headRevisionId!); expect(text).toContain('Homeowner design acceptance'); expect(text).toContain('Designer design approval'); expect(text).toContain('not signatures');
    }
    expect(fs.readFileSync(info.outputPath('designer-agreement.md'), 'utf8')).toBe(fs.readFileSync(info.outputPath('client-agreement.md'), 'utf8'));
    await capture(client, info, 'client-draft-agreement-library');
    await accessible(client);
    for (const current of [page, client]) {
      await current.reload(); await geometry(current);
      await current.getByRole('tab', { name: 'Together', exact: true }).click();
      await expect(current.getByRole('button', { name: 'Download agreement', exact: true })).toBeEnabled();
    }
    await capture(page, info, 'designer-agreement-reopened');
    recording.mark('Both people download the same agreement and reopen its shared library.');
    expect(guard.submitted).toBe(3);
    expect(jobs.reduce((sum, job) => sum + job.attemptsUsed, 0)).toBeLessThanOrEqual(6);
    await info.attach('production-v1-value-proof', { body: JSON.stringify({ gitRevision: target.expectedGitRevision, provider: 'gemini', explicitJobBudget: 3, providerAttemptBudget: 6, submittedJobs: guard.submitted, reservedAttempts: jobs.reduce((sum, job) => sum + job.attemptsUsed, 0), jobs, separateSyntheticGuestIdentities: true, assistantProfileSource: 'configured-default', agreedRevision: agreement.revisionId, savedDraftAgreement: true, redactions: ['invitation code', 'invitation QR'], tokensAndInvitationFragmentsCaptured: false }), contentType: 'application/json' });
    complete = true;
  } finally {
    if (recording) await recording.finish(complete);
    await clientContext.close();
  }
});
