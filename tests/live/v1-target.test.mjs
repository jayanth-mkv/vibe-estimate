import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { v1ProductionArguments, v1ProductionTarget, v1ProductionHealth } from '../../scripts/v1-production-target.mjs';

const sha = 'a'.repeat(40), target = 'https://vibeestimate-123456.asia-south1.run.app';
test('production V1 requires an explicit exact target and revision and never accepts replay flags', () => {
  assert.deepEqual(v1ProductionArguments(['--target', target, '--expected-git-sha', sha]), { list: false, target, expectedGitRevision: sha });
  for (const args of [[], ['--target', target], ['--target', 'http://localhost:3100', '--expected-git-sha', sha], ['--target', target, '--expected-git-sha', 'HEAD'], ['--target', target, '--expected-git-sha', sha, '--retries', '1'], ['--target', target, '--expected-git-sha', sha, '--grep', 'story']]) assert.throws(() => v1ProductionArguments(args));
});
test('private target records must agree and evidence stays outside the checkout', () => {
  const options = v1ProductionArguments(['--target', target, '--expected-git-sha', sha]);
  const operator = { firebaseProjectId: 'authorized-identity', backendProjectId: 'authorized-api', backendRegion: 'asia-south1' }, discovery = { backendProjectId: 'authorized-api', projectNumber: '123456' }, outputs = { public_url: { value: target } };
  const repository = path.resolve('repository'), privateRoot = path.resolve('private');
  assert.equal(v1ProductionTarget(options, operator, discovery, outputs, repository, privateRoot).explicitJobBudget, 3);
  assert.throws(() => v1ProductionTarget(options, operator, { ...discovery, backendProjectId: 'another-api' }, outputs, repository, privateRoot));
  assert.throws(() => v1ProductionTarget(options, operator, discovery, outputs, repository, path.join(repository, '.cache')));
});
test('health gates identity creation and model work on the exact deployed commit', () => {
  const health = { status: 'ok', runtime: 'production', aiProvider: 'gemini', auth: 'firebase', storage: 'firestore', storageConnection: 'cloud', gitRevision: sha };
  assert.equal(v1ProductionHealth(health, sha), true);
  for (const replacement of [{ gitRevision: 'b'.repeat(40) }, { gitRevision: undefined }, { runtime: 'local' }, { aiProvider: 'fixture' }, { storageConnection: 'emulator' }]) assert.equal(v1ProductionHealth({ ...health, ...replacement }, sha), false);
});
