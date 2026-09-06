import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseInputs, runtimeVariables, verifyPlan, verifyHealth } from '../verify-release.mjs';

const metadata = {
  backend_project_id: 'example-backend', firebase_project_id: 'example-firebase',
  project_number: '123456789012', region: 'asia-south1', firestore_database_id: '(default)',
  gemini_model: 'gemini-example-flash', runtime_service_account: 'example-runtime@example-backend.iam.gserviceaccount.com',
  task_queue: 'projects/example-backend/locations/asia-south1/queues/example-reviews',
  task_service_account: 'example-delivery@example-backend.iam.gserviceaccount.com',
  firebase_web_config_secret: 'example-web-config', firebase_web_config_version: '1',
};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
const environment = {
  BRANCH_NAME: 'main', COMMIT_SHA: 'a'.repeat(40), RELEASE_RUNTIME_VARS_B64: encode(metadata),
  RELEASE_IMAGE_REPOSITORY: 'asia-south1-docker.pkg.dev/example-backend/example/application',
  RELEASE_STATE_BUCKET: 'example-runtime-state', RELEASE_GITHUB_REPOSITORY: 'example-owner/example-repository',
};
const digest = 'sha256:' + 'b'.repeat(64);
const variables = runtimeVariables(releaseInputs(environment), digest);
const service = {
  id: 'projects/example-backend/locations/asia-south1/services/vibeestimate', name: 'vibeestimate',
  project: 'example-backend', location: 'asia-south1', deletion_protection: true,
  template: [{ containers: [{ image: variables.image }] }],
};
const plan = () => ({ complete: true, resource_changes: [{
  address: 'google_cloud_run_v2_service.application', type: 'google_cloud_run_v2_service', mode: 'managed',
  change: { actions: ['update'], before: structuredClone(service), after: structuredClone(service) },
}] });

test('main metadata becomes an immutable runtime input without auth or payload values', () => {
  const inputs = releaseInputs(environment);
  assert.deepEqual(inputs.metadata, metadata);
  assert.equal(runtimeVariables(inputs, digest).image, environment.RELEASE_IMAGE_REPOSITORY + '@' + digest);
  assert.equal(Object.hasOwn(variables, 'access_token'), false);
});

test('rejects non-main, missing or abbreviated commits and misdirected repository/state inputs', () => {
  for (const changes of [
    { BRANCH_NAME: 'feature/example' }, { BRANCH_NAME: '' }, { COMMIT_SHA: 'abcdef' },
    { RELEASE_IMAGE_REPOSITORY: 'asia-south1-docker.pkg.dev/unrelated-project/example/application' },
    { RELEASE_STATE_BUCKET: '../state' }, { RELEASE_GITHUB_REPOSITORY: 'https://github.com/example/repo' },
  ]) assert.throws(() => releaseInputs({ ...environment, ...changes }));
});

test('rejects credential/payload keys, malformed base64, emulator and cross-project identities', () => {
  for (const changes of [
    { access_token: 'synthetic-token' }, { firebase_web_config: '{}' }, { image: variables.image },
    { firebase_project_id: 'demo-example' }, { runtime_service_account: 'example-runtime@unrelated-project.iam.gserviceaccount.com' },
    { task_queue: 'projects/example-backend/locations/us-central1/queues/example-reviews' },
    { firebase_web_config_version: 'latest' },
  ]) assert.throws(() => releaseInputs({ ...environment, RELEASE_RUNTIME_VARS_B64: encode({ ...metadata, ...changes }) }));
  assert.throws(() => releaseInputs({ ...environment, RELEASE_RUNTIME_VARS_B64: environment.RELEASE_RUNTIME_VARS_B64 + '\n' }));
});

test('rejects tags, malformed digests and extra digest output', () => {
  for (const value of ['latest', 'sha256:123', digest + '\nextra', digest.toUpperCase()]) {
    assert.throws(() => runtimeVariables(releaseInputs(environment), value));
  }
});

test('accepts only the already-adopted target service update or no-op', () => {
  assert.equal(verifyPlan(plan(), variables).changed, true);
  const unchanged = plan(); unchanged.resource_changes[0].change.actions = ['no-op'];
  assert.equal(verifyPlan(unchanged, variables).changed, false);
});

test('rejects creation, deletion, replacement, additional resources and incomplete plans', () => {
  for (const actions of [['create'], ['delete'], ['delete', 'create'], ['create', 'delete'], ['read']]) {
    const value = plan(); value.resource_changes[0].change.actions = actions;
    assert.throws(() => verifyPlan(value, variables));
  }
  const additional = plan(); additional.resource_changes.push({ address: 'google_project_iam_member.unrelated' });
  assert.throws(() => verifyPlan(additional, variables));
  assert.throws(() => verifyPlan({ ...plan(), complete: false }, variables));
  assert.throws(() => verifyPlan({ ...plan(), deferred_changes: [{}] }, variables));
});

test('rejects wrong service identity, unprotected service and mismatched image', () => {
  for (const mutate of [
    value => { value.resource_changes[0].change.before.id = 'unrelated-service'; },
    value => { value.resource_changes[0].change.after.deletion_protection = false; },
    value => { value.resource_changes[0].change.after.template[0].containers[0].image += '-wrong'; },
  ]) { const value = plan(); mutate(value); assert.throws(() => verifyPlan(value, variables)); }
});

test('health verification rejects fixture/local metadata without making model requests', () => {
  const health = { status: 'ok', runtime: 'production', auth: 'firebase', storage: 'firestore', storageConnection: 'cloud', aiProvider: 'gemini', geminiTransport: 'vertex' };
  assert.equal(verifyHealth(health).productionHealth, true);
  for (const change of [{ runtime: 'local' }, { auth: 'emulator' }, { aiProvider: 'fixture' }, { storageConnection: 'emulator' }]) assert.throws(() => verifyHealth({ ...health, ...change }));
  const commit = 'a'.repeat(40);
  assert.equal(verifyHealth({ ...health, gitRevision: commit }, commit).productionHealth, true);
  assert.throws(() => verifyHealth(health, commit));
  assert.throws(() => verifyHealth({ ...health, gitRevision: 'b'.repeat(40) }, commit));
  assert.throws(() => verifyHealth({ ...health, gitRevision: 'abcdef' }, 'abcdef'));
});
