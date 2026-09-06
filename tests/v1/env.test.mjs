import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { v1Arguments, v1Environment, v1HealthMatches, v1Target } from '../../scripts/v1-env.mjs';
const run = path.resolve('.cache/v1/config-check');

test('isolated v1 settings reject inherited credentials and preserve connected ports', () => {
  const env = v1Environment(run, { PATH: process.env.PATH, GEMINI_API_KEY: 'do-not-propagate', GOOGLE_APPLICATION_CREDENTIALS: 'private.json', vertex_gcloud_account: 'private', NEXT_PUBLIC_API_URL: 'https://unexpected.invalid', FIRESTORE_EMULATOR_HOST: 'cloud.invalid', DEBUG: '*' });
  for (const key of ['GEMINI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'vertex_gcloud_account', 'DEBUG']) assert.equal(env[key], undefined);
  assert.equal(env.NEXT_PUBLIC_API_URL, '');
  assert.equal(env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8285');
  assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9299');
  assert.equal(env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL, 'http://127.0.0.1:9299');
  assert.equal(env.BACKEND_ORIGIN, 'http://127.0.0.1:8181');
  assert.equal(env.NEXT_PUBLIC_AUTH_MODE, 'guest');
  assert.ok(!v1Target.ports.some(port => [3000, 8080, 9099, 8085].includes(port)));
});

test('recording runner admits bounded options and rejects live repetitions', () => {
  assert.deepEqual(v1Arguments(['test', '--grep', 'Flow 2']), { mode: 'test', geminiConfig: undefined, grep: 'Flow 2', legacy: false });
  assert.equal(v1Arguments(['test', '--gemini-config', '../docs/private/vertex-local.json']).geminiConfig, '../docs/private/vertex-local.json');
  for (const args of [['test', '--retries', '3'], ['test', '--gemini-config', 'private.json', '--grep', 'anything'], ['test', '--gemini-config', 'private.json', '--legacy'], ['test', '--grep'], ['start', '--legacy']]) assert.throws(() => v1Arguments(args));
});

test('fixture health never accepts a real cloud datastore or wrong provider', () => {
  const health = { status: 'ok', runtime: 'local', aiProvider: 'fixture', auth: 'emulator', storage: 'firestore', storageConnection: 'emulator' };
  assert.equal(v1HealthMatches(health), true);
  for (const patch of [{ runtime: 'production' }, { storageConnection: 'cloud' }, { auth: 'firebase' }, { aiProvider: 'gemini' }]) assert.equal(v1HealthMatches({ ...health, ...patch }), false);
  assert.equal(v1HealthMatches({ ...health, aiProvider: 'gemini' }, 'gemini'), true);
  assert.throws(() => v1Environment(path.resolve('../outside-evidence')));
  assert.throws(() => v1Environment(run, { k_service: 'cloud-runtime' }), /local process/);
  assert.throws(() => v1Environment(run, { APP_ENV: 'production' }), /local process/);
});
