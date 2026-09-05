import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This fixture runs the real RESTful provider against loopback only. Google
// resources are mocked. It creates no cloud resources and uses no credentials.
const infra = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(infra, '..');
const fixture = resolve(repo, '.cache/gemini-provider-contract');
const terraform = resolve(infra, '.tools/terraform-1.13.5/terraform.exe');
const project = 'example-authorized-project';
const collection = `/v2/projects/${project}/locations/global/keys`;
const keyPath = `${collection}/vibeestimate-local-gemini`;
const keyName = keyPath.slice(4);
const fakeResponseOnlyKey = 'fixture-response-only-value';
const fakeToken = 'fixture-provider-oauth-token';
const operations = new Map();
const seen = [];
let current;
let failure;

const server = createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${fakeToken}`);
    assert.equal(request.headers['x-goog-user-project'], project);
    const url = new URL(request.url, 'http://127.0.0.1');
    const reply = (code, data) => {
      response.writeHead(code, { 'content-type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    seen.push(`${request.method} ${url.pathname}`);
    if (request.method === 'POST' && url.pathname === collection) {
      assert.equal(url.searchParams.get('keyId'), 'vibeestimate-local-gemini');
      assert.equal(current, undefined, 'A duplicate create must never replace a key.');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.deepEqual(body.restrictions.apiTargets, [{ service: 'generativelanguage.googleapis.com' }]);
      assert.equal(body.serviceAccountEmail, `vibeestimate-local-gemini@${project}.iam.gserviceaccount.com`);
      current = { ...body, name: keyName, uid: 'fixture-uid', etag: 'fixture-etag', keyString: fakeResponseOnlyKey };
      operations.set('create', 0);
      return reply(200, { name: 'operations/create' });
    }
    if (request.method === 'GET' && url.pathname.startsWith('/v2/operations/')) {
      const operation = url.pathname.split('/').at(-1);
      assert.ok(operations.has(operation), 'Only the operation returned by this fixture may be polled.');
      const count = operations.get(operation);
      operations.set(operation, count + 1);
      // Protobuf JSON omits false: first response has no done property.
      if (count === 0) return reply(200, { name: `operations/${operation}` });
      if (operation === 'delete') current = undefined;
      return reply(200, { name: `operations/${operation}`, done: true, response: current ?? {} });
    }
    if (request.method === 'GET' && url.pathname === keyPath) {
      return current ? reply(200, current) : reply(404, { error: { code: 404, message: 'Fixture key absent' } });
    }
    if (request.method === 'PATCH' && url.pathname === keyPath) {
      assert.ok(current);
      assert.equal(url.searchParams.get('updateMask'), 'displayName,restrictions');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.deepEqual(body.restrictions.apiTargets, [{ service: 'generativelanguage.googleapis.com' }]);
      current = { ...current, ...body };
      operations.set('update', 0);
      return reply(200, { name: 'operations/update' });
    }
    if (request.method === 'DELETE' && url.pathname === keyPath) {
      assert.ok(current);
      operations.set('delete', 0);
      return reply(200, { name: 'operations/delete' });
    }
    throw new Error(`Unexpected local fixture route: ${request.method} ${url.pathname}`);
  } catch (error) {
    failure = error;
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 500, message: 'Local contract assertion failed' } }));
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
await mkdir(resolve(fixture, 'tests'), { recursive: true });
await mkdir(resolve(fixture, 'data'), { recursive: true });
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith('TF_VAR_') || key.startsWith('TF_LOG')) delete env[key];
}
Object.assign(env, {
  TF_DATA_DIR: resolve(fixture, 'data'),
  TF_CLI_CONFIG_FILE: resolve(infra, '.tools/terraform-gemini-offline.rc'),
  TF_PLUGIN_CACHE_DIR: resolve(infra, '.tools/provider-cache'),
  CHECKPOINT_DISABLE: '1',
  TEMP: resolve(infra, '.tools/temp'),
  TMP: resolve(infra, '.tools/temp'),
});
async function run(args) {
  return new Promise((done, reject) => {
    let output = '';
    const child = spawn(terraform, [`-chdir=${fixture}`, ...args], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timeout = setTimeout(() => child.kill(), 120_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      // Only artificial fixture strings are redacted here; live credentials
      // are not available to the loopback provider or fixture module.
      const clean = output.replaceAll(fakeToken, '[fixture-token]').replaceAll(fakeResponseOnlyKey, '[fixture-value]');
      if (code !== 0) return reject(new Error(clean));
      done(clean);
    });
  });
}

try {
  for (const name of ['versions.tf', 'variables.tf', 'main.tf', 'outputs.tf']) {
    let source = await readFile(resolve(infra, 'gemini-local', name), 'utf8');
    source = source.replace('https://apikeys.googleapis.com/v2', `http://127.0.0.1:${port}/v2`);
    // Only the disposable loopback fixture permits teardown or display rename.
    source = source.replaceAll('prevent_destroy = true', 'prevent_destroy = false');
    if (name === 'main.tf') source = source.replaceAll('"VibeEstimate local Gemini"', 'var.fixture_display_name');
    await writeFile(resolve(fixture, name), source);
  }
  await copyFile(resolve(infra, 'gemini-local/.terraform.lock.hcl'), resolve(fixture, '.terraform.lock.hcl'));
  await writeFile(resolve(fixture, 'fixture.tf'), 'variable "fixture_display_name" { default = "Fixture Gemini key" }\n');
  await writeFile(resolve(fixture, 'tests/contract.tftest.hcl'), `
mock_provider "google" {
  mock_resource "google_service_account" {
    defaults = { email = "vibeestimate-local-gemini@${project}.iam.gserviceaccount.com" }
  }
}
variables {
  project_id = "${project}"
  provision_gemini = true
  access_token = "${fakeToken}"
}
run "create_async_key_and_filter_response" {
  command = apply
  assert {
    condition = restful_resource.gemini_key[0].sensitive_output.serviceAccountEmail == google_service_account.gemini[0].email && !can(restful_resource.gemini_key[0].sensitive_output.keyString)
    error_message = "Binding must survive create/read while unexpected credential fields are filtered."
  }
}
run "unchanged_key_does_not_duplicate" {
  command = apply
}
run "update_waits_for_operation" {
  command = apply
  variables { fixture_display_name = "Renamed fixture Gemini key" }
  assert {
    condition = restful_resource.gemini_key[0].sensitive_output.displayName == "Renamed fixture Gemini key"
    error_message = "Updated metadata must be read only after its operation completes."
  }
}
`);
  await run(['init', '-backend=false', '-input=false', '-no-color']);
  const result = await run(['test', '-no-color']);
  if (failure) throw failure;
  assert.equal(seen.filter((item) => item.startsWith('POST ')).length, 1);
  assert.equal(seen.filter((item) => item.startsWith('PATCH ')).length, 1);
  assert.equal(seen.filter((item) => item.startsWith('DELETE ')).length, 1);
  assert.ok([...operations.values()].every((count) => count >= 2));
  assert.equal(current, undefined);
  process.stdout.write(result);
  process.stdout.write('Loopback provider contract verified: create, no duplicate on reapply, update, teardown; all operations polled; credential response field excluded.\n');
} finally {
  await new Promise((done) => server.close(done));
}
