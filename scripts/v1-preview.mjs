import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './local-env.mjs';
import { portOpen, stopChild } from './processes.mjs';
import { geminiBackendEnv } from './gemini-config.mjs';
import { v1Arguments, v1Environment, v1HealthMatches, v1Target } from './v1-env.mjs';

const children = [];
let stopping = false;
let runDirectory;
let browser;
let provider = 'fixture';
const stages = { freshEmulators: false, frontendBuild: false, backend: false, gateway: false, rules: false, browser: false };
let rejectFailure;
const failure = new Promise((_, reject) => { rejectFailure = reject; });
failure.catch(() => {});
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function start(label, script, args, cwd, env, service = false) {
  const log = fs.createWriteStream(path.join(runDirectory, 'logs', label + '.log'), { flags: 'a' });
  const child = spawn(process.execPath, [path.join(root, script), ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const finished = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(label + ' could not start. Inspect its local log.')));
    child.once('exit', code => resolve(code));
  });
  finished.catch(() => {});
  const closed = new Promise(resolve => child.once('close', () => log.end(resolve)));
  children.push({ label, child, finished, closed });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    log.write(chunk);
    // Backend/model logs remain private, including on failure.
    if (!service) process.stdout.write(chunk);
  });
  log.on('error', () => rejectFailure(new Error('A V1 verification log could not be written.')));
  if (service) finished.then(() => { if (!stopping) rejectFailure(new Error(label + ' stopped before verification finished. Inspect its local log.')); }, rejectFailure);
  return finished;
}

async function check(label, script, args, env, cwd = root) {
  const code = await Promise.race([start(label, script, args, cwd, env), failure]);
  if (code !== 0) throw new Error(label + ' failed. Inspect the run report.');
}

async function ready(label, predicate, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let notice = Date.now() + 15000;
  while (Date.now() < deadline && !stopping) {
    try { if (await predicate()) return; } catch { /* Bounded startup polling only. */ }
    if (Date.now() > notice) { console.log('Waiting for ' + label + '. Details stay in local logs.'); notice = Date.now() + 15000; }
    await Promise.race([pause(500), failure]);
  }
  throw new Error(label + ' did not become ready.');
}

async function json(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('An isolated endpoint is unavailable.');
  return response.json();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  rejectFailure(new Error('V1 preview stopped.'));
});

try {
  const options = v1Arguments(process.argv.slice(2));
  for (const port of v1Target.ports) if (await portOpen(port)) throw new Error('Isolated port ' + port + ' is occupied. Existing processes were left running.');
  if (!fs.existsSync(path.join(root, 'backend', 'dist', 'index.js'))) throw new Error('Build the application first with npm run build.');
  const parent = path.join(root, '.cache', 'v1');
  fs.mkdirSync(parent, { recursive: true });
  runDirectory = fs.mkdtempSync(path.join(parent, new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-'));
  for (const directory of ['logs', 'firebase', 'config', 'local', 'cache', 'tmp', 'frontend', 'evidence']) fs.mkdirSync(path.join(runDirectory, directory), { recursive: true });
  const browserEnv = v1Environment(runDirectory);
  // The built frontend runs in production mode. The compiled API deliberately
  // remains APP_ENV=local/NODE_ENV=development so its emulator guards stay on.
  const localBackend = { ...browserEnv, NODE_ENV: 'development' };
  const backendEnv = options.geminiConfig ? geminiBackendEnv(localBackend, options.geminiConfig) : localBackend;
  provider = backendEnv.AI_PROVIDER;
  const env = { ...browserEnv, V1_PROVIDER: provider, ...(options.legacy ? { V1_LEGACY: '1' } : {}) };
  // Never give the browser worker private Gemini/profile settings.
  const frontend = path.join(runDirectory, 'frontend');
  for (const directory of ['src', 'public']) fs.cpSync(path.join(root, 'frontend', directory), path.join(frontend, directory), { recursive: true, errorOnExist: true, force: false });
  for (const file of ['package.json', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs']) fs.copyFileSync(path.join(root, 'frontend', file), path.join(frontend, file), fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(root, 'frontend', 'next.config.ts'), path.join(frontend, 'next.config.fixture-source.ts'), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(frontend, 'next.config.ts'), 'import config from "./next.config.fixture-source";\nexport default { ...config, turbopack: { ...config.turbopack, root: ' + JSON.stringify(root) + ' } };\n', { flag: 'wx' });
  console.log('V1 isolated production preview: ' + v1Target.appOrigin + ' → ' + v1Target.apiOrigin + '; provider ' + provider + '. Existing connected ports remain untouched.');
  console.log('Evidence: ' + path.relative(root, runDirectory));
  await check('frontend-build', 'node_modules/next/dist/bin/next', ['build'], env, frontend);
  stages.frontendBuild = true;
  const firebaseConfig = path.join(runDirectory, 'firebase.json');
  fs.writeFileSync(firebaseConfig, JSON.stringify({ firestore: { rules: path.join(root, 'firestore.rules') }, emulators: {
    auth: { host: '127.0.0.1', port: 9299 }, firestore: { host: '127.0.0.1', port: 8285, websocketPort: 9153 },
    ui: { enabled: false }, hub: { host: '127.0.0.1', port: 4403 }, logging: { host: '127.0.0.1', port: 4503 }, singleProjectMode: true,
  } }, null, 2), { flag: 'wx' });
  start('emulators', 'node_modules/firebase-tools/lib/bin/firebase.js', ['emulators:start', '--only', 'auth,firestore', '--project', v1Target.projectId, '--config', firebaseConfig, '--non-interactive'], path.join(runDirectory, 'firebase'), { ...env, NODE_ENV: 'development' }, true);
  await ready('empty emulators', async () => await portOpen(9299) && await portOpen(8285), 300000);
  const accounts = await json(v1Target.authOrigin + '/identitytoolkit.googleapis.com/v1/projects/' + v1Target.projectId + '/accounts:batchGet?maxResults=-1', { headers: { Authorization: 'Bearer owner' } });
  const collections = await json('http://' + v1Target.firestoreHost + '/v1/projects/' + v1Target.projectId + '/databases/(default)/documents:listCollectionIds', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' });
  if ((accounts.users?.length ?? 0) || (collections.collectionIds?.length ?? 0)) throw new Error('Isolated emulators were not empty; no data was altered.');
  stages.freshEmulators = true;
  start('backend', 'backend/dist/index.js', [], root, backendEnv, true);
  await ready('isolated API', async () => v1HealthMatches(await json(v1Target.apiOrigin + '/health'), provider));
  stages.backend = true;
  start('frontend', 'node_modules/next/dist/bin/next', ['start', '--hostname', '127.0.0.1', '--port', '3100'], frontend, env, true);
  await ready('production frontend gateway', async () => v1HealthMatches(await json(v1Target.appOrigin + '/health'), provider));
  stages.gateway = true;
  console.log('Ready: ' + v1Target.appOrigin + '. Auth and data are isolated emulators; model mode is ' + provider + '.');
  fs.writeFileSync(path.join(runDirectory, 'ready.json'), JSON.stringify({ appOrigin: v1Target.appOrigin, apiOrigin: v1Target.apiOrigin, provider, modelCallsClaimed: 0 }, null, 2));
  if (options.mode === 'test') {
    if (provider === 'fixture') {
      await check('rules', 'node_modules/vitest/vitest.mjs', ['run', '--config', 'vitest.rules.config.ts'], env);
      stages.rules = true;
    }
    await check('playwright', 'node_modules/@playwright/test/cli.js', ['test', '--config', 'tests/v1/playwright.config.ts', ...(options.grep ? ['--grep', options.grep] : [])], env);
    stages.browser = true;
  } else {
    if (options.mode === 'review') {
      process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto(v1Target.appOrigin);
      await Promise.race([new Promise(resolve => browser.on('disconnected', resolve)), failure]);
    } else await failure;
  }
} catch (error) {
  if (!stopping) { console.error(error instanceof Error ? error.message : 'V1 preview failed; private settings were not displayed.'); process.exitCode = 1; }
} finally {
  stopping = true;
  await browser?.close().catch(() => {});
  for (const entry of [...children].reverse()) stopChild(entry.child);
  await Promise.race([Promise.all(children.map(entry => entry.closed)), pause(10000)]);
  if (runDirectory) fs.writeFileSync(path.join(runDirectory, 'verification.json'), JSON.stringify({ finishedAt: new Date().toISOString(), provider, stages, target: v1Target, importedWorkspace: false, exitCode: process.exitCode ?? 0 }, null, 2));
}
