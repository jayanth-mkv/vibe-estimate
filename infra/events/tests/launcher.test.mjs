import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedEventResources, checkEventApplyBilling, inspectEventPlan, validateEventSettings } from '../../../scripts/terraform-events.mts';

const settings = {
  backendProjectId: 'example-backend', firebaseProjectId: 'example-firebase',
  firestoreDatabaseId: '(default)', firebaseLocation: 'nam5', region: 'asia-southeast1',
  projectNumber: '123456789012', gcloudConfiguration: 'example-profile', account: 'operator@example.test',
};
const operator = { ...settings, backendRegion: settings.region };
const vertex = { ...settings, projectId: settings.backendProjectId };
const connected = { ...settings };
const discovery = { backendProjectId: settings.backendProjectId, region: settings.region, projectNumber: settings.projectNumber };
const change = (override = {}) => ({
  address: 'google_cloud_run_v2_service_iam_member.dispatcher', mode: 'managed', type: 'google_cloud_run_v2_service_iam_member',
  change: { actions: ['create'], after: { project: settings.backendProjectId, location: settings.region, name: 'vibeestimate', role: 'roles/run.invoker', member: `serviceAccount:vibeestimate-events@${settings.firebaseProjectId}.iam.gserviceaccount.com` } },
  ...override,
});

test('separately verified source and target are accepted; wrong account/profile/database are denied', () => {
  assert.deepEqual(validateEventSettings(settings, operator, vertex, connected, discovery), settings);
  for (const field of ['backendProjectId', 'firebaseProjectId', 'firestoreDatabaseId', 'projectNumber', 'region', 'account', 'gcloudConfiguration']) {
    assert.throws(() => validateEventSettings({ ...settings, [field]: 'wrong-target' }, operator, vertex, connected, discovery));
  }
  assert.throws(() => validateEventSettings({ ...settings, apiKey: 'not-allowed' }, operator, vertex, connected, discovery));
  assert.throws(() => validateEventSettings({ ...settings, firebaseLocation: 'global' }, operator, vertex, connected, discovery));
});

test('plan permits the dedicated service invocation grant and denies mutation or project escape', () => {
  assert.deepEqual(inspectEventPlan({ resource_changes: [change()] }, settings), [{ resource: change().address, actions: ['create'] }]);
  for (const actions of [['update'], ['delete'], ['delete', 'create']]) {
    const item = change(); item.change.actions = actions;
    assert.throws(() => inspectEventPlan({ resource_changes: [item] }, settings));
  }
  for (const replacement of [{ project: 'other-backend' }, { member: 'allUsers' }, { role: 'roles/owner' }, { name: 'other-service' }, { location: 'us-central1' }]) {
    const item = change(); Object.assign(item.change.after, replacement);
    assert.throws(() => inspectEventPlan({ resource_changes: [item] }, settings));
  }
  assert.throws(() => inspectEventPlan({ resource_changes: [change({ address: 'google_cloud_run_v2_service.application', type: 'google_cloud_run_v2_service' })] }, settings));
});

test('event plans cannot broaden created-job filtering or accept implicit imports', () => {
  const item = {
    address: 'google_eventarc_trigger.outbox_created', type: 'google_eventarc_trigger', mode: 'managed',
    change: { actions: ['create'], after: {
      project: settings.firebaseProjectId, name: 'vibeestimate-review-outbox', location: settings.firebaseLocation,
      service_account: `vibeestimate-event-trigger@${settings.firebaseProjectId}.iam.gserviceaccount.com`, event_data_content_type: 'application/protobuf',
      matching_criteria: [
        { attribute: 'type', value: 'google.cloud.firestore.document.v1.created' },
        { attribute: 'database', value: '(default)' },
        { attribute: 'document', value: 'roomReviewOutbox/{jobId}', operator: 'match-path-pattern' },
      ],
    } },
  };
  assert.equal(inspectEventPlan({ resource_changes: [item] }, settings).length, 1);
  const broad = structuredClone(item); broad.change.after.matching_criteria[2].value = '**';
  assert.throws(() => inspectEventPlan({ resource_changes: [broad] }, settings));
  const loop = structuredClone(item); loop.change.after.matching_criteria[0].value = 'google.cloud.firestore.document.v1.written';
  assert.throws(() => inspectEventPlan({ resource_changes: [loop] }, settings));
  const imported = structuredClone(item); imported.change.importing = { id: 'unreviewed' };
  assert.throws(() => inspectEventPlan({ resource_changes: [imported] }, settings));
});

test('imports resolve to exact source APIs and no existing database or service resource', () => {
  const allowed = allowedEventResources(settings);
  assert.equal(allowed.get('google_project_service.required["pubsub.googleapis.com"]').importId, 'example-firebase/pubsub.googleapis.com');
  assert.equal(allowed.has('google_firestore_database.default'), false);
  assert.equal(allowed.has('google_cloud_run_v2_service.application'), false);
  assert.equal(allowed.size, 12);
});

test('an imported unchanged API may omit its state-only lifecycle flag; newly enabled APIs must preserve it', () => {
  const item = {
    address: 'google_project_service.required["pubsub.googleapis.com"]', mode: 'managed', type: 'google_project_service',
    change: { actions: ['no-op'], after: { project: settings.firebaseProjectId, service: 'pubsub.googleapis.com', disable_on_destroy: null } },
  };
  assert.deepEqual(inspectEventPlan({ resource_changes: [item] }, settings), []);
  const creation = structuredClone(item); creation.change.actions = ['create'];
  assert.throws(() => inspectEventPlan({ resource_changes: [creation] }, settings));
  creation.change.after.disable_on_destroy = false;
  assert.equal(inspectEventPlan({ resource_changes: [creation] }, settings).length, 1);
  const destructiveFlag = structuredClone(item); destructiveFlag.change.after.disable_on_destroy = true;
  assert.throws(() => inspectEventPlan({ resource_changes: [destructiveFlag] }, settings));
});

test('billing preflight runs only for apply and reads the explicit source without a quota override', async () => {
  let calls = 0;
  const request = async (url, options) => {
    calls++;
    assert.equal(url, 'https://cloudbilling.googleapis.com/v1/projects/example-firebase/billingInfo?fields=projectId,billingEnabled');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(options.headers['X-Goog-User-Project'], undefined);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ projectId: settings.firebaseProjectId, billingEnabled: true });
  };
  for (const action of ['init', 'plan', 'import', 'outputs', 'validate', 'fmt']) await checkEventApplyBilling(action, settings, 'synthetic-token', request);
  assert.equal(calls, 0);
  await checkEventApplyBilling('apply', settings, 'synthetic-token', request);
  assert.equal(calls, 1);
});

test('apply fails closed for disabled, missing, or mismatched source billing', async () => {
  for (const info of [{ projectId: settings.firebaseProjectId, billingEnabled: false }, { projectId: settings.firebaseProjectId }]) {
    await assert.rejects(checkEventApplyBilling('apply', settings, 'synthetic-token', async () => Response.json(info)), /billing is not enabled.*No Terraform changes were started/);
  }
  await assert.rejects(checkEventApplyBilling('apply', settings, 'synthetic-token', async () => Response.json({ projectId: 'wrong-project', billingEnabled: true })), /billing response did not match.*No Terraform changes were started/);
});

test('billing lookup failures expose no token, response body, or raw network error', async () => {
  for (const request of [
    async () => new Response('private-response-body', { status: 403 }),
    async () => new Response('invalid-private-json', { status: 200 }),
    async () => { throw new Error('network failure containing synthetic-token'); },
  ]) {
    await assert.rejects(checkEventApplyBilling('apply', settings, 'synthetic-token', request), error => {
      assert.match(error.message, /billing could not be verified.*No Terraform changes were started/);
      assert.doesNotMatch(error.message, /private|synthetic-token|network failure/);
      return true;
    });
  }
});
