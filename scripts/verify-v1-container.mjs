import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const help = `Usage: node scripts/verify-v1-container.mjs --image <local-image:tag> --expected-sha <40-lowercase-hex> [--context <local-docker-context>]

Verifies an already-built image with its embedded BUILD_GIT_SHA. Never builds,
pulls, publishes ports, mounts credentials, or starts Docker. Both test containers
use --network none and synthetic production settings. Evidence is saved under
.cache/v1/. A local Unix socket or Windows named-pipe Docker context is required.
`;

function argumentsFor(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return null;
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--image', '--expected-sha', '--context'].includes(flag) || !value || value.startsWith('-') || options[flag]) {
      throw new Error('Supply each supported flag once, with an explicit value. Use --help for usage.');
    }
    options[flag] = value;
  }
  const image = options['--image'];
  if (!image || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/.test(image)) throw new Error('An explicit valid local image reference is required.');
  const expectedSha = options['--expected-sha'];
  if (!/^[0-9a-f]{40}$/.test(expectedSha ?? '')) throw new Error('--expected-sha must be a complete lowercase Git revision.');
  const context = options['--context'];
  if (context && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(context)) throw new Error('Invalid Docker context name.');
  if (!context && process.env.DOCKER_HOST) throw new Error('DOCKER_HOST is set. Supply --context naming an explicit local Docker context.');
  return { image, expectedSha, context };
}

const productionEnvironment = {
  APP_ENV: 'production', NODE_ENV: 'production', PORT: '8080', AI_PROVIDER: 'gemini',
  FIREBASE_PROJECT_ID: 'container-fixture-firebase', FIRESTORE_DATABASE_ID: '(default)',
  FRONTEND_ORIGIN: 'https://container-fixture.invalid', GEMINI_TRANSPORT: 'vertex',
  GEMINI_MODEL: 'gemini-3.7-flash', VERTEX_AUTH_MODE: 'runtime',
  VERTEX_PROJECT_ID: 'container-fixture-runtime', VERTEX_LOCATION: 'global',
  ROOM_TASK_QUEUE: 'projects/container-fixture-runtime/locations/asia-south1/queues/reviews',
  ROOM_TASK_SERVICE_ACCOUNT: 'tasks@container-fixture-runtime.iam.gserviceaccount.com',
  FIREBASE_WEB_CONFIG: JSON.stringify({
    apiKey: 'synthetic-public-web-config-for-container',
    authDomain: 'container-fixture-firebase.firebaseapp.com', projectId: 'container-fixture-firebase',
    appId: '1:1234567890:web:feedface12345678',
  }),
};

// Sent over stdin to Node inside the isolated container, with no shell involved.
function positiveProbe(expectedSha) {
  return `
import assert from 'node:assert/strict';
const expectedSha = ${JSON.stringify(expectedSha)};
const checks = [];
const started = Date.now();
async function get(url) { return fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' }); }
async function waitForHealth(port) {
  const deadline = started + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await get('http://127.0.0.1:' + port + '/health');
      if (response.status === 200) {
        const health = await response.json();
        assert.equal(health.status, 'ok');
        assert.equal(health.gitRevision, expectedSha, 'Image health must match the expected Git revision');
        assert.equal(health.runtime, 'production'); assert.equal(health.aiProvider, 'gemini');
        assert.equal(health.auth, 'firebase'); assert.equal(health.storage, 'firestore');
        assert.equal(health.storageConnection, 'cloud'); assert.equal(health.geminiTransport, 'vertex');
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        checks.push({ name: port === 8081 ? 'api-health' : 'frontend-health', status: response.status, health });
        return;
      }
    } catch (error) { if (error?.code === 'ERR_ASSERTION') throw error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Production health did not become ready on port ' + port);
}
await waitForHealth(8081); await waitForHealth(8080);
const origin = 'http://127.0.0.1:8080';
const homepage = await get(origin + '/');
assert.equal(homepage.status, 200); assert.ok((homepage.headers.get('content-type') ?? '').includes('text/html'));
const html = await homepage.text();
assert.match(html, /<html[ >]/i); assert.match(html, /VibeEstimate/i);
checks.push({ name: 'homepage', status: homepage.status, bytes: Buffer.byteLength(html) });
const model = await get(origin + '/models/sofa.glb'); assert.equal(model.status, 200);
const glb = Buffer.from(await model.arrayBuffer());
assert.ok(glb.length > 20 && glb.length < 5 * 1024 * 1024);
assert.equal(glb.subarray(0, 4).toString('ascii'), 'glTF');
assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
checks.push({ name: 'local-admitted-glb', bytes: glb.length, version: 2 });
const thumbnail = await get(origin + '/models/sofa.png'); assert.equal(thumbnail.status, 200);
const png = Buffer.from(await thumbnail.arrayBuffer());
assert.ok(png.length > 24 && png.length < 3 * 1024 * 1024);
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
checks.push({ name: 'local-admitted-thumbnail', bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
for (const port of [8081, 8080]) {
  const denied = await get('http://127.0.0.1:' + port + '/api/homes');
  assert.equal(denied.status, 401); assert.equal((await denied.json()).error?.code, 'AUTH_REQUIRED');
  checks.push({ name: port === 8081 ? 'api-unauthenticated-denial' : 'frontend-unauthenticated-denial', status: 401 });
}
console.log('V1_CONTAINER_PROBE=' + JSON.stringify({ checks, elapsedMs: Date.now() - started }));
`;
}

// Observe actual startup before its imports execute: absence of a log message
// alone would not prove that neither application server had been spawned.
const negativePreload = `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
let spawnedChildren = 0; let listeningServers = 0;
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  const original = childProcess[key];
  childProcess[key] = function (...args) { spawnedChildren++; return Reflect.apply(original, this, args); };
}
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) { listeningServers++; return Reflect.apply(listen, this, args); };
syncBuiltinESMExports();
process.on('exit', exitCode => console.log('V1_NEGATIVE_STARTUP=' + JSON.stringify({ exitCode, spawnedChildren, listeningServers })));
`;

async function main(options) {
  const runId = randomUUID();
  const directory = path.join(root, '.cache', 'v1', 'container-' + new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-' + runId.slice(0, 8));
  fs.mkdirSync(directory, { recursive: true });
  const report = { startedAt: new Date().toISOString(), image: options.image, expectedSha: options.expectedSha, network: 'none', cloudCalls: false, complete: false, checks: [], cleanup: [] };
  const owned = new Map();
  const abort = new AbortController();
  const onSignal = signal => { if (!abort.signal.aborted) abort.abort(new Error('Verification interrupted by ' + signal)); };
  const onInterrupt = () => onSignal('SIGINT'); const onTerminate = () => onSignal('SIGTERM');
  process.on('SIGINT', onInterrupt); process.on('SIGTERM', onTerminate);
  const dockerEnvironment = { ...process.env };
  for (const key of Object.keys(dockerEnvironment)) if (/^DOCKER_(HOST|CONTEXT|TLS|TLS_VERIFY|CERT_PATH)$/i.test(key)) delete dockerEnvironment[key];
  let context;
  let imageId;

  function command(args, { input, timeout = 30000, allowFailure = false, cleanup = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!cleanup && abort.signal.aborted) { reject(abort.signal.reason); return; }
      const actualArgs = context ? ['--context', context, ...args] : args;
      const child = spawn('docker', actualArgs, { cwd: root, env: dockerEnvironment, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = { stdout: [], stderr: [] }; let bytes = 0; let failure;
      const fail = error => { failure ??= error; child.kill(); };
      const timer = setTimeout(() => fail(new Error('Docker ' + args[0] + ' exceeded its time limit.')), timeout);
      const cancel = () => fail(abort.signal.reason);
      if (!cleanup) abort.signal.addEventListener('abort', cancel, { once: true });
      for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) fail(new Error('Docker output exceeded the evidence limit.'));
        else chunks[stream].push(chunk);
      });
      child.once('error', error => { failure ??= error; });
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') fail(error); });
      child.once('close', code => {
        clearTimeout(timer); abort.signal.removeEventListener('abort', cancel);
        const result = { code, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') };
        if (failure) reject(failure);
        else if (code !== 0 && !allowFailure) reject(new Error('Docker ' + args[0] + ' failed (' + code + '): ' + result.stderr.slice(-2500)));
        else resolve(result);
      });
      child.stdin.end(input);
    });
  }

  async function inspectContainer(name, cleanup = false) {
    const result = await command(['container', 'inspect', name], { allowFailure: true, cleanup });
    if (result.code !== 0) {
      if (/No such (?:object|container)/i.test(result.stderr)) return null;
      throw new Error('Could not verify ownership of test container ' + name + '.');
    }
    const value = JSON.parse(result.stdout)[0];
    assert.equal(value.Name, '/' + name, 'Container name changed; refusing cleanup.');
    assert.equal(value.Config?.Labels?.['vibeestimate.verification-run'], runId, 'Container ownership label mismatch; refusing cleanup.');
    assert.equal(value.Image, imageId, 'Container image changed; refusing cleanup.');
    assert.equal(value.HostConfig?.NetworkMode, 'none', 'Container network isolation changed.');
    return value;
  }

  async function removeOwned(name) {
    const container = await inspectContainer(name, true);
    if (container) {
      if (container.State.Running) await command(['container', 'stop', '--time', '10', container.Id], { cleanup: true });
      await command(['container', 'rm', '--force', container.Id], { cleanup: true });
    }
    owned.delete(name); report.cleanup.push({ name, removed: true });
  }

  async function create(kind, environment, override = []) {
    const name = 'vibeestimate-v1-' + kind + '-' + runId;
    // Track before dispatch so cleanup also handles a lost create response.
    owned.set(name, kind);
    const envArgs = Object.entries(environment).flatMap(([key, value]) => ['--env', key + '=' + value]);
    const result = await command(['container', 'create', '--pull=never', '--name', name, '--label', 'vibeestimate.verification-run=' + runId,
      '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', ...envArgs, imageId, ...override]);
    const container = await inspectContainer(name);
    assert.ok(container && result.stdout.trim() === container.Id, 'Created container ID could not be verified.');
    assert.deepEqual(container.HostConfig.PortBindings ?? {}, {}, 'Test containers must not publish ports.');
    assert.equal(container.Mounts?.length ?? 0, 0, 'Test containers must not mount host data.');
    await command(['container', 'start', container.Id]);
    return { name, id: container.Id };
  }

  async function saveLogs(name, kind) {
    const container = await inspectContainer(name, true);
    if (!container) return;
    const logs = await command(['container', 'logs', '--tail', '120', container.Id], { allowFailure: true, cleanup: true });
    fs.writeFileSync(path.join(directory, kind + '.log'), logs.stdout + logs.stderr);
    return logs.stdout + logs.stderr;
  }

  try {
    context = options.context ?? process.env.DOCKER_CONTEXT ?? (await command(['context', 'show'])).stdout.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(context)) throw new Error('Invalid Docker context name.');
    const contextData = JSON.parse((await command(['context', 'inspect', context])).stdout)[0];
    const endpoint = contextData.Endpoints?.docker?.Host ?? '';
    if (!endpoint.startsWith('unix:///') && !/^npipe:\/{4}\.\/pipe\//i.test(endpoint)) throw new Error('Only a local Unix socket or Windows named-pipe Docker context is allowed.');
    report.context = context;
    const imageData = JSON.parse((await command(['image', 'inspect', options.image])).stdout)[0];
    imageId = imageData.Id;
    assert.match(imageId, /^sha256:[0-9a-f]{64}$/);
    const imageEnvironment = Object.fromEntries((imageData.Config?.Env ?? []).map(entry => { const index = entry.indexOf('='); return [entry.slice(0, index), entry.slice(index + 1)]; }));
    assert.equal(imageEnvironment.BUILD_GIT_SHA, options.expectedSha, 'Embedded image BUILD_GIT_SHA must match --expected-sha; this check never injects a replacement SHA.');
    const forbidden = Object.keys(imageEnvironment).filter(key => /^(?:GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CREDENTIALS|GOOGLE_CLOUD_KEYFILE_JSON|GCLOUD_KEYFILE_JSON|GOOGLE_OAUTH_ACCESS_TOKEN|FIREBASE_AUTH_EMULATOR_HOST|FIRESTORE_EMULATOR_HOST)$|^(?:CLOUDSDK_AUTH_|VERTEX_GCLOUD_|CONNECTED_AUTH_)/i.test(key));
    assert.equal(forbidden.length, 0, 'Image must not contain credential overrides or emulator settings.');
    assert.deepEqual(imageData.Config?.Cmd, ['node', 'scripts/start-production.mjs'], 'Verify the normal packaged production command.');
    assert.ok(imageData.Config.User && !['root', '0', '0:0'].includes(imageData.Config.User), 'Production image must use a non-root user.');
    report.imageId = imageId;
    report.checks.push({ name: 'embedded-build-revision', gitRevision: options.expectedSha });

    console.log('Checking packaged production startup with network access disabled.');
    const positive = await create('production', productionEnvironment);
    const probe = await command(['container', 'exec', '--interactive', positive.id, 'node', '--input-type=module'], { input: positiveProbe(options.expectedSha), timeout: 110000 });
    const resultLine = probe.stdout.split(/\r?\n/).find(line => line.startsWith('V1_CONTAINER_PROBE='));
    assert.ok(resultLine, 'The container probe did not produce verification evidence.');
    const result = JSON.parse(resultLine.slice('V1_CONTAINER_PROBE='.length));
    assert.equal(result.checks.length, 7);
    report.checks.push(...result.checks); report.productionElapsedMs = result.elapsedMs;
    await saveLogs(positive.name, 'production');
    await removeOwned(positive.name);

    console.log('Checking that missing production settings prevent both servers from starting.');
    const preloadUrl = 'data:text/javascript,' + encodeURIComponent(negativePreload);
    const negative = await create('invalid', { APP_ENV: 'production', NODE_ENV: 'production', FIREBASE_WEB_CONFIG: '' }, ['node', '--import', preloadUrl, 'scripts/start-production.mjs']);
    const waited = await command(['container', 'wait', negative.id], { timeout: 15000 });
    const exitCode = Number(waited.stdout.trim());
    assert.ok(Number.isInteger(exitCode) && exitCode !== 0, 'Invalid startup must exit unsuccessfully.');
    const stopped = await inspectContainer(negative.name);
    assert.equal(stopped.State.Running, false); assert.equal(stopped.State.OOMKilled, false);
    const logs = await saveLogs(negative.name, 'invalid');
    assert.match(logs, /Explicit production settings are required\./);
    const marker = logs.split(/\r?\n/).find(line => line.startsWith('V1_NEGATIVE_STARTUP='));
    assert.ok(marker, 'Invalid startup did not produce server-start instrumentation.');
    const observed = JSON.parse(marker.slice('V1_NEGATIVE_STARTUP='.length));
    assert.equal(observed.exitCode, exitCode); assert.equal(observed.spawnedChildren, 0); assert.equal(observed.listeningServers, 0);
    report.checks.push({ name: 'invalid-production-startup', ...observed });
    await removeOwned(negative.name);
    report.complete = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    for (const [name, kind] of owned) {
      try { await saveLogs(name, kind); } catch { /* Cleanup must still be attempted. */ }
      try { await removeOwned(name); }
      catch (error) { report.cleanup.push({ name, removed: false, error: error.message }); report.complete = false; process.exitCode = 1; console.error('Owned container cleanup failed: ' + name + '. Inspect the evidence report.'); }
    }
    if (abort.signal.aborted) { report.complete = false; process.exitCode = 1; }
    process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log((report.complete ? 'Container verification passed. ' : 'Container verification did not pass. ') + 'Evidence: ' + path.relative(root, directory));
  }
}

try {
  const options = argumentsFor(process.argv.slice(2));
  if (!options) console.log(help);
  else await main(options);
} catch (error) { console.error(error.message); process.exitCode = 1; }
