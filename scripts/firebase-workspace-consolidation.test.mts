import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256, type MigrationSettings } from './firebase-migration-data.mts';
import { documentHash, planWorkspaceConsolidation, typed, validateWorkspaceGraph, type WorkspaceDocument } from './firebase-workspace-consolidation.mts';

const time = '2026-01-02T03:04:05.123456789Z';
const currentTime = '2026-01-03T03:04:05.987654321Z';
const owner = 'google-owner', guest = 'guest-owner', client = 'guest-client';
const home = '11111111-1111-4111-8111-111111111111', priorHome = '22222222-2222-4222-8222-222222222222';
const project = '33333333-3333-4333-8333-333333333333', room = '44444444-4444-4444-8444-444444444444';
const firstRevision = '55555555-5555-4555-8555-555555555555', headRevision = '66666666-6666-4666-8666-666666666666';
const settings: MigrationSettings = {
  sourceProjectId: 'demo-workspace-source', targetProjectId: 'demo-workspace-target', sourceDatabaseId: '(default)', targetDatabaseId: '(default)',
  gcloudConfiguration: 'demo-profile', account: 'owner@example.invalid', gcloudConfigDir: '/demo/profile', snapshotDirectory: '/demo/snapshots',
};
const sourcePrefix = `projects/${settings.sourceProjectId}/databases/(default)/documents/`;
const targetPrefix = `projects/${settings.targetProjectId}/databases/(default)/documents/`;
const fields = (value: Record<string, unknown>) => typed(value).mapValue.fields;
const doc = (path: string, data: Record<string, unknown>, updated = time): WorkspaceDocument => ({ path, fields: fields(data), createTime: time, updateTime: updated });
const google = { localId: owner, createdAt: '1700000000000', email: 'owner@example.invalid', emailVerified: true, providerUserInfo: [{ providerId: 'google.com', rawId: 'demo-google-provider-id' }] };
const guestUser = (localId: string) => ({ localId, createdAt: '1700000000001' });
const homePath = (uid = guest) => `users/${uid}/homes/${home}`;
const projectPath = (uid = guest) => `users/${uid}/projects/${project}`;

function revision(id: string, parent: string | null) {
  const body = { id, parentRevisionId: parent, createdAt: time, ownerId: guest, actorUid: guest, title: 'Original fixture revision', scene: { note: 'Keep original evidence', count: 3 } };
  return doc(`${homePath()}/revisions/${id}`, { content: JSON.stringify(body), hash: sha256(JSON.stringify({ ...body, createdAt: '' })) });
}

function fixture() {
  const targetDocuments = [
    doc(`homeOwners/${owner}`, { homeIds: [priorHome], creations: { 'current-google-create': priorHome }, callsUsed: 12 }, currentTime),
    doc(`users/${owner}/homes/${priorHome}`, { id: priorHome, ownerId: owner, title: 'Newer Google home', revisions: [], receipts: {}, jobs: {} }, currentTime),
    doc(`roomOwners/${owner}`, { projects: {}, migratedProjectIds: [] }, currentTime),
    doc(`homeRoomOwners/${owner}`, { homes: {} }, currentTime),
    doc(`designAssistants/${owner}`, { profiles: { 'google-assistant': { id: 'google-assistant', ownerId: owner, name: 'Current Google assistant' } }, receipts: { 'google-assistant-create': { id: 'google-assistant', hash: 'e'.repeat(64) } } }, currentTime),
  ];
  const documents = [
    ...structuredClone(targetDocuments),
    doc(`homeOwners/${guest}`, { homeIds: [home], creations: { 'guest-home-create': home }, callsUsed: 3 }),
    doc(`roomOwners/${guest}`, { projects: { [project]: room } }),
    doc(`homeRoomOwners/${guest}`, { homes: { [home]: room } }),
    doc(`designAssistants/${guest}`, { profiles: { 'guest-assistant': { id: 'guest-assistant', ownerId: guest, name: 'Original guest assistant', history: { actorUid: guest } } }, receipts: { 'guest-assistant-create': { id: 'guest-assistant', hash: 'f'.repeat(64) } } }),
    doc(homePath(), { id: home, ownerId: guest, roomId: room, proposalProjectId: project, headRevisionId: headRevision,
      revisions: [{ id: firstRevision, parentRevisionId: null }, { id: headRevision, parentRevisionId: firstRevision }],
      receipts: { 'old-design-request': { revisionId: firstRevision, projectId: project } },
      jobs: { 'old-design-job': { status: 'complete', kind: 'design', baseRevisionId: firstRevision, resultRevisionId: headRevision }, 'old-agreement-job': { status: 'complete', kind: 'agreement', baseRevisionId: headRevision, resultSummaryId: 'agreement-1' } },
      history: [{ actorUid: guest, request: 'Original request', accepted: false }] }),
    doc(projectPath(), { id: project, ownerId: guest, roomId: room, sourceMessages: [{ actorUid: guest, text: 'Original source evidence' }], proposals: [{ id: 'proposal-1', approved: false, quantity: 2, unitPricePaise: 1500, totalPaise: 3000 }] }),
    doc(`rooms/${room}`, { id: room, ownerId: guest, clientId: client, projectId: project, homeId: home, paused: false, nextRunAt: 123,
      observer: { status: 'idle', lastReview: 'Preserve original review' }, messages: [{ actorUid: guest, role: 'designer', text: 'Original owner message' }, { actorUid: client, role: 'client', text: 'Original client message' }],
      snapshots: [{ projectId: project, accepted: false }], sharedDrafts: [{ projectId: project, title: 'Original draft' }] }),
    doc(`homeRooms/${room}`, { ownerId: guest, roomId: room, homeId: home, assistantId: 'guest-assistant', decisions: [{ actorUid: client, revisionId: headRevision, action: 'accept' }] }),
    revision(firstRevision, null), revision(headRevision, firstRevision),
    doc(`${homePath()}/agreementProse/agreement-1`, { content: 'Original immutable agreement text', authorUid: guest, revisionId: headRevision }),
  ];
  // Existing Google indexes have advanced since this immutable source snapshot.
  documents.find(item => item.path === `homeOwners/${owner}`)!.fields.callsUsed = typed(1);
  documents.find(item => item.path === `users/${owner}/homes/${priorHome}`)!.fields.title = typed('Older Google home title');
  return { source: { schemaVersion: 1 as const, source: { projectId: settings.sourceProjectId, databaseId: '(default)' }, capturedAt: time, readTime: time, documents, users: [structuredClone(google), guestUser(guest), guestUser(client)] },
    settings: structuredClone(settings), sourceManifestSha256: 'a'.repeat(64), targetDocuments, targetUsers: [structuredClone(google)], targetUid: owner };
}
type Input = ReturnType<typeof fixture>;
const sourceDoc = (input: Input, path: string) => input.source.documents.find(item => item.path === path)!;
const targetDoc = (input: Input, path: string) => input.targetDocuments.find(item => item.path === path)!;
const changed = (plan: ReturnType<typeof planWorkspaceConsolidation>, path: string) => plan.changes.find(item => item.path === path)!;
function finalDocuments(input: Input, plan: ReturnType<typeof planWorkspaceConsolidation>) {
  const all = new Map(input.targetDocuments.map(item => [item.path, structuredClone(item)]));
  for (const change of [...plan.changes, plan.receipt]) all.set(change.path, { path: change.path, fields: structuredClone(change.fields), createTime: currentTime, updateTime: currentTime });
  return [...all.values()];
}

test('reassigns guest ownership with discoverable links while preserving Google work, actors and immutable history', () => {
  const input = fixture(), before = canonicalJson(input), plan = planWorkspaceConsolidation(input);
  assert.equal(canonicalJson(input), before, 'Planning must not mutate the snapshot, account list, or live target read.');
  assert.deepEqual(plan.counts, { homes: 2, projects: 1, rooms: 1, revisions: 2, sharedHomes: 1, sourceDocuments: 11, sourceGuestOwners: 1, anonymousAccountsImported: 0, createdDocuments: 7, updatedIndexes: 4 });
  assert.equal(changed(plan, homePath(owner)).fields.ownerId.stringValue, owner);
  assert.equal(changed(plan, projectPath(owner)).fields.ownerId.stringValue, owner);
  assert.deepEqual(changed(plan, homePath(owner)).fields.history, sourceDoc(input, homePath()).fields.history);
  assert.deepEqual(changed(plan, projectPath(owner)).fields.sourceMessages, sourceDoc(input, projectPath()).fields.sourceMessages);
  assert.deepEqual(changed(plan, projectPath(owner)).fields.proposals, sourceDoc(input, projectPath()).fields.proposals);
  const savedRoom = changed(plan, `rooms/${room}`).fields, oldRoom = sourceDoc(input, `rooms/${room}`).fields;
  assert.equal(savedRoom.ownerId.stringValue, owner); assert.equal(savedRoom.clientId.stringValue, client);
  assert.deepEqual(savedRoom.messages, oldRoom.messages); assert.deepEqual(savedRoom.snapshots, oldRoom.snapshots); assert.deepEqual(savedRoom.sharedDrafts, oldRoom.sharedDrafts);
  assert.equal(savedRoom.paused.booleanValue, true); assert.equal(savedRoom.nextRunAt.integerValue, '0'); assert.equal(savedRoom.observer.mapValue.fields.status.stringValue, 'paused');
  assert.deepEqual(savedRoom.observer.mapValue.fields.lastReview, oldRoom.observer.mapValue.fields.lastReview);
  for (const child of [`revisions/${firstRevision}`, `revisions/${headRevision}`, 'agreementProse/agreement-1']) {
    assert.deepEqual(changed(plan, `${homePath(owner)}/${child}`).fields, sourceDoc(input, `${homePath()}/${child}`).fields);
  }
  assert.equal(plan.changes.some(item => item.path === `users/${owner}/homes/${priorHome}`), false);
  assert.deepEqual(validateWorkspaceGraph(finalDocuments(input, plan), owner), { homes: 2, projects: 1, rooms: 1, revisions: 2, sharedHomes: 1 });
});

test('preserves Firestore int64, nanoseconds and nested types, rewriting typed references but never source text', () => {
  const input = fixture();
  const typedEvidence = {
    maximum: { integerValue: '9223372036854775807' }, minimum: { integerValue: '-9223372036854775808' }, timestamp: { timestampValue: time }, bytes: { bytesValue: 'AAEC/w==' },
    geo: { geoPointValue: { latitude: -12.4, longitude: 76.1 } }, fraction: { doubleValue: 0.125 }, nan: { doubleValue: 'NaN' },
    empty: { mapValue: {} }, array: { arrayValue: { values: [{ nullValue: null }, { booleanValue: false }, { stringValue: guest }] } },
    sourceText: { stringValue: sourcePrefix + homePath() }, ref: { referenceValue: sourcePrefix + homePath() },
    nested: { mapValue: { fields: { ref: { referenceValue: sourcePrefix + `rooms/${room}` } } } },
  };
  sourceDoc(input, projectPath()).fields.evidence = { mapValue: { fields: typedEvidence } };
  const result = changed(planWorkspaceConsolidation(input), projectPath(owner)).fields.evidence.mapValue.fields;
  for (const key of ['maximum', 'minimum', 'timestamp', 'bytes', 'geo', 'fraction', 'nan', 'array', 'sourceText']) assert.deepEqual(result[key], typedEvidence[key]);
  assert.deepEqual(result.empty, { mapValue: { fields: {} } });
  assert.equal(result.ref.referenceValue, targetPrefix + homePath(owner));
  assert.equal(result.nested.mapValue.fields.ref.referenceValue, targetPrefix + `rooms/${room}`);
});

test('merges indexes and current counters once without overwriting existing Google receipts or assistants', () => {
  const input = fixture(), plan = planWorkspaceConsolidation(input);
  const index = changed(plan, `homeOwners/${owner}`).fields;
  assert.deepEqual(index.homeIds, typed([priorHome, home])); assert.equal(index.callsUsed.integerValue, '15');
  assert.deepEqual(index.creations, typed({ 'current-google-create': priorHome, 'guest-home-create': home }));
  const assistants = changed(plan, `designAssistants/${owner}`).fields;
  assert.deepEqual(assistants.profiles.mapValue.fields['google-assistant'], targetDoc(input, `designAssistants/${owner}`).fields.profiles.mapValue.fields['google-assistant']);
  assert.equal(assistants.profiles.mapValue.fields['guest-assistant'].mapValue.fields.ownerId.stringValue, owner);
  assert.equal(assistants.profiles.mapValue.fields['guest-assistant'].mapValue.fields.history.mapValue.fields.actorUid.stringValue, guest);
  assert.deepEqual(assistants.receipts, typed({ 'google-assistant-create': { id: 'google-assistant', hash: 'e'.repeat(64) }, 'guest-assistant-create': { id: 'guest-assistant', hash: 'f'.repeat(64) } }));
  assert.deepEqual(changed(plan, `roomOwners/${owner}`).fields.migratedProjectIds, typed([project]));
  targetDoc(input, `homeOwners/${owner}`).fields.callsUsed = typed(20);
  const newer = planWorkspaceConsolidation(input);
  assert.equal(changed(newer, `homeOwners/${owner}`).fields.callsUsed.integerValue, '23');
  assert.notEqual(newer.planSha256, plan.planSha256);
});

test('creates missing target indexes and handles empty source maps without losing assistant ownership rewrites', () => {
  const input = fixture();
  input.source.documents = input.source.documents.filter(item => !item.path.includes(`/${owner}`));
  input.targetDocuments = [];
  sourceDoc(input, `homeOwners/${guest}`).fields.creations = { mapValue: {} };
  sourceDoc(input, `designAssistants/${guest}`).fields.receipts = { mapValue: {} };
  sourceDoc(input, homePath()).fields.receipts = { mapValue: {} };
  sourceDoc(input, homePath()).fields.jobs = { mapValue: {} };
  const plan = planWorkspaceConsolidation(input);
  assert.equal(plan.counts.updatedIndexes, 0); assert.equal(plan.counts.createdDocuments, 11);
  assert.equal(changed(plan, `homeOwners/${owner}`).fields.callsUsed.integerValue, '3');
  assert.deepEqual(changed(plan, `homeOwners/${owner}`).fields.creations, typed({}));
  assert.deepEqual(changed(plan, `designAssistants/${owner}`).fields.receipts, typed({}));
  assert.equal(changed(plan, `designAssistants/${owner}`).fields.profiles.mapValue.fields['guest-assistant'].mapValue.fields.ownerId.stringValue, owner);
  assert.deepEqual(changed(plan, homePath(owner)).fields.jobs, typed({}));
  assert.ok(plan.writes.every(write => 'exists' in write.currentDocument && write.currentDocument.exists === false));
});

test('retains active target operation metadata and current counters behind exact CAS preconditions', () => {
  const input = fixture(), activeHome = typed({ requestId: 'current-google-operation', status: 'running', callsReserved: 1 }), activeRoom = typed({ roomId: 'current-google-room', requestId: 'current-google-room-operation' });
  targetDoc(input, `homeOwners/${owner}`).fields.active = structuredClone(activeHome);
  targetDoc(input, `roomOwners/${owner}`).fields.active = structuredClone(activeRoom);
  const plan = planWorkspaceConsolidation(input);
  assert.deepEqual(changed(plan, `homeOwners/${owner}`).fields.active, activeHome);
  assert.deepEqual(changed(plan, `roomOwners/${owner}`).fields.active, activeRoom);
  assert.equal(changed(plan, `homeOwners/${owner}`).fields.callsUsed.integerValue, '15');
  for (const path of [`homeOwners/${owner}`, `roomOwners/${owner}`]) {
    assert.deepEqual(plan.writes.find(write => write.update.name === targetPrefix + path)!.currentDocument, { updateTime: currentTime });
    assert.equal(changed(plan, path).beforeHash, documentHash(targetDoc(input, path)));
  }
});

test('binds every atomic write to the target and uses create-only or exact live-version preconditions', () => {
  const input = fixture(), plan = planWorkspaceConsolidation(input);
  assert.equal(plan.writes.length, plan.changes.length + 1);
  for (const write of plan.writes) {
    assert.ok(write.update.name.startsWith(targetPrefix));
    assert.ok(!write.update.name.startsWith(sourcePrefix));
    const path = write.update.name.slice(targetPrefix.length), prior = input.targetDocuments.find(item => item.path === path);
    if (prior) {
      assert.deepEqual(write.currentDocument, { updateTime: currentTime });
      assert.equal(changed(plan, path).beforeHash, documentHash(prior));
    } else assert.deepEqual(write.currentDocument, { exists: false });
  }
  assert.equal(plan.writes.at(-1)!.update.name, targetPrefix + plan.receipt.path);
  assert.equal(plan.receipt.fields.planSha256.stringValue, plan.planSha256);
  assert.equal(plan.receipt.fields.sourceManifestSha256.stringValue, input.sourceManifestSha256);
  delete targetDoc(input, `homeOwners/${owner}`).updateTime;
  assert.throws(() => planWorkspaceConsolidation(input), /TARGET_VERSION_REQUIRED/);
});

test('binds an idempotency receipt to owner, source manifest and target; retry cannot add counters twice', () => {
  const input = fixture(), plan = planWorkspaceConsolidation(input);
  assert.equal(plan.receipt.path, `firebaseOwnershipMigrations/${sha256(canonicalJson({ version: 1, sourceManifestSha256: input.sourceManifestSha256, targetProject: settings.targetProjectId, owner }))}`);
  const reordered = structuredClone(input); reordered.source.documents.reverse(); reordered.targetDocuments.reverse();
  assert.equal(planWorkspaceConsolidation(reordered).planSha256, plan.planSha256);
  const applied = { ...input, targetDocuments: finalDocuments(input, plan) };
  assert.throws(() => planWorkspaceConsolidation(applied), /CONSOLIDATION_ALREADY_APPLIED/);
  assert.throws(() => planWorkspaceConsolidation({ ...applied, sourceManifestSha256: 'b'.repeat(64) }), /DESTINATION_DOCUMENT_COLLISION/);
});

test('requires matching enabled Google identity and never imports or accepts existing guest Auth accounts', () => {
  const invalid: [string, (input: Input) => void, RegExp][] = [
    ['owner absent', input => { input.targetUid = 'wrong-owner'; }, /GOOGLE_OWNER_REQUIRED/],
    ['manifest malformed', input => { input.sourceManifestSha256 = 'not-a-manifest'; }, /OWNER_BINDING_INVALID/],
    ['source project mismatch', input => { input.source.source.projectId = 'demo-other-source'; }, /SNAPSHOT_INVALID/],
    ['provider mismatch', input => { input.targetUsers[0].providerUserInfo[0].rawId = 'another-google-identity'; }, /GOOGLE_OWNER_REQUIRED/],
    ['disabled target', input => { Object.assign(input.targetUsers[0], { disabled: true }); }, /GOOGLE_OWNER_REQUIRED/],
    ['missing target provider', input => { input.targetUsers[0].providerUserInfo = []; }, /GOOGLE_OWNER_REQUIRED/],
    ['unrelated source account', input => { Object.assign(input.source.users[1], { providerUserInfo: [{ providerId: 'google.com', rawId: 'another-google-identity' }] }); }, /UNRELATED_SOURCE_ACCOUNT/],
    ['guest already imported', input => { input.targetUsers.push(guestUser(guest) as typeof google); }, /LEGACY_ACCOUNT_ALREADY_IMPORTED/],
  ];
  for (const [label, change, expected] of invalid) { const input = fixture(); change(input); assert.throws(() => planWorkspaceConsolidation(input), expected, label); }
});

test('rejects duplicate target UID and provider identity bindings before planning data writes', () => {
  const duplicateUid = fixture(); duplicateUid.targetUsers.push(structuredClone(google));
  assert.throws(() => planWorkspaceConsolidation(duplicateUid), /TARGET_USER_COLLISION/);
  const duplicateProvider = fixture(); duplicateProvider.targetUsers.push({ ...structuredClone(google), localId: 'second-target-owner', email: 'second-owner@example.invalid' });
  assert.throws(() => planWorkspaceConsolidation(duplicateProvider), /TARGET_PROVIDER_COLLISION/);
});

test('rejects document, home-index, creation-receipt and assistant-key collisions without partial writes', () => {
  const cases: [string, (input: Input) => void, RegExp][] = [
    ['document exists', input => { input.targetDocuments.push(doc(homePath(owner), { id: home, ownerId: owner })); }, /DESTINATION_DOCUMENT_COLLISION/],
    ['duplicate guest document destination', input => { const duplicate = structuredClone(sourceDoc(input, projectPath())); duplicate.path = `users/${client}/projects/${project}`; duplicate.fields.ownerId = typed(client); input.source.documents.push(duplicate); }, /DESTINATION_DOCUMENT_COLLISION/],
    ['home already indexed', input => { targetDoc(input, `homeOwners/${owner}`).fields.homeIds = typed([priorHome, home]); }, /HOME_ID_COLLISION/],
    ['receipt key exists', input => { targetDoc(input, `homeOwners/${owner}`).fields.creations.mapValue.fields['guest-home-create'] = typed(priorHome); }, /INDEX_KEY_COLLISION/],
    ['assistant key exists', input => { targetDoc(input, `designAssistants/${owner}`).fields.profiles.mapValue.fields['guest-assistant'] = typed({ id: 'guest-assistant', ownerId: owner }); }, /INDEX_KEY_COLLISION/],
  ];
  for (const [label, change, expected] of cases) { const input = fixture(); change(input); const before = canonicalJson(input); assert.throws(() => planWorkspaceConsolidation(input), expected, label); assert.equal(canonicalJson(input), before); }
});

test('refuses unfinished guest work, owner/client collapse and unsupported source fields', () => {
  const cases: [string, string, (data: Record<string, any>) => void, RegExp][] = [
    ['queued room', `rooms/${room}`, data => { data.observer.mapValue.fields.status = typed('queued'); }, /SOURCE_WORK_UNFINISHED/],
    ['thinking room', `rooms/${room}`, data => { data.observer.mapValue.fields.status = typed('thinking'); }, /SOURCE_WORK_UNFINISHED/],
    ['active delivery', `rooms/${room}`, data => { data.delivery = typed({ jobId: 'in-flight' }); }, /SOURCE_WORK_UNFINISHED/],
    ['paid run', `rooms/${room}`, data => { data.run = typed({ jobId: 'in-flight' }); }, /SOURCE_WORK_UNFINISHED/],
    ['proposal review', projectPath(), data => { data.analysisAttempt = typed({ status: 'running' }); }, /SOURCE_WORK_UNFINISHED/],
    ['home save pending', homePath(), data => { data.jobs.mapValue.fields['old-design-job'].mapValue.fields.status = typed('save_pending'); }, /SOURCE_WORK_UNFINISHED/],
    ['active owner operation', `homeOwners/${guest}`, data => { data.active = typed({ requestId: 'in-flight' }); }, /SOURCE_WORK_UNFINISHED/],
    ['owner and client same', `rooms/${room}`, data => { data.clientId = typed(owner); }, /ROOM_IDENTITY_COLLAPSE/],
    ['unknown index schema', `homeOwners/${guest}`, data => { data.newUnknownCounter = typed(2); }, /INDEX_FIELDS_UNSUPPORTED/],
    ['mismatched owner', homePath(), data => { data.ownerId = typed(client); }, /SOURCE_OWNER_MISMATCH/],
  ];
  for (const [label, path, change, expected] of cases) { const input = fixture(); change(sourceDoc(input, path).fields); assert.throws(() => planWorkspaceConsolidation(input), expected, label); }
  const external = fixture(); sourceDoc(external, homePath()).fields.reference = { referenceValue: 'projects/demo-unrelated/databases/(default)/documents/rooms/other' };
  assert.throws(() => planWorkspaceConsolidation(external), /EXTERNAL_REFERENCE_UNSUPPORTED/);
  const malformed = fixture(); sourceDoc(malformed, homePath()).fields.badValue = { integerValue: '9223372036854775808' };
  assert.throws(() => planWorkspaceConsolidation(malformed), /FIRESTORE_VALUE_INVALID/);
});

test('verifies immutable revision content and every reachable saved reference before returning a plan', () => {
  const cases: [string, (input: Input) => void, RegExp][] = [
    ['changed original revision bytes', input => { const saved = sourceDoc(input, `${homePath()}/revisions/${firstRevision}`).fields; const content = JSON.parse(saved.content.stringValue); content.scene.note = 'Tampered history'; saved.content = typed(JSON.stringify(content)); }, /REVISION_INTEGRITY_FAILED/],
    ['missing parent revision', input => { input.source.documents = input.source.documents.filter(item => item.path !== `${homePath()}/revisions/${firstRevision}`); }, /DANGLING_DOCUMENT/],
    ['missing head revision', input => { sourceDoc(input, homePath()).fields.headRevisionId = typed('missing-head'); }, /DANGLING_DOCUMENT/],
    ['dangling receipt', input => { sourceDoc(input, homePath()).fields.receipts.mapValue.fields['old-design-request'].mapValue.fields.revisionId = typed('missing-receipt-revision'); }, /DANGLING_DOCUMENT/],
    ['dangling agreement', input => { input.source.documents = input.source.documents.filter(item => item.path !== `${homePath()}/agreementProse/agreement-1`); }, /DANGLING_DOCUMENT/],
    ['home link mismatch', input => { sourceDoc(input, `homeRoomOwners/${guest}`).fields.homes.mapValue.fields[home] = typed('wrong-room'); }, /HOME_ROOM_MISMATCH/],
  ];
  for (const [label, change, expected] of cases) { const input = fixture(); change(input); assert.throws(() => planWorkspaceConsolidation(input), expected, label); }
});

test('rejects mismatched assistants, dangling creation receipts and shared-home assistant links', () => {
  const cases: [string, (input: Input) => void, RegExp][] = [
    ['profile ID mismatch', input => { sourceDoc(input, `designAssistants/${guest}`).fields.profiles.mapValue.fields['guest-assistant'].mapValue.fields.id = typed('wrong-profile-id'); }, /ASSISTANT_OWNER_MISMATCH/],
    ['wrong profile owner', input => { sourceDoc(input, `designAssistants/${guest}`).fields.profiles.mapValue.fields['guest-assistant'].mapValue.fields.ownerId = typed(client); }, /ASSISTANT_OWNER_MISMATCH/],
    ['dangling assistant receipt', input => { sourceDoc(input, `designAssistants/${guest}`).fields.receipts.mapValue.fields['guest-assistant-create'].mapValue.fields.id = typed('missing-assistant'); }, /ASSISTANT_RECEIPT_DANGLING/],
    ['dangling shared-home assistant', input => { sourceDoc(input, `homeRooms/${room}`).fields.assistantId = typed('missing-assistant'); }, /ASSISTANT_LINK_DANGLING/],
  ];
  for (const [label, change, expected] of cases) { const input = fixture(); change(input); assert.throws(() => planWorkspaceConsolidation(input), expected, label); }
});

test('malformed immutable revision JSON fails without disclosing private revision content', () => {
  const privateMarker = 'synthetic-private-revision-do-not-display';
  for (const content of [`{"private":"${privateMarker}",`, 'null', '[]']) {
    const input = fixture(); sourceDoc(input, `${homePath()}/revisions/${headRevision}`).fields.content = typed(content);
    assert.throws(() => planWorkspaceConsolidation(input), error => {
      assert.ok(error instanceof Error); assert.equal(error.message, 'REVISION_INTEGRITY_FAILED');
      assert.ok(!error.stack?.includes(privateMarker)); return true;
    });
  }
});
