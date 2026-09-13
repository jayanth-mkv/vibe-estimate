import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalJson, copyData, createRestStore, externalPath, importableUser,
  loadSnapshot, mappedDocuments, migrationAllowlist, planDataCopy,
  remapFirestoreValue, saveSnapshot, scanAuth, scanFirestore, sha256,
  snapshotSummary, stableUser, validateMigrationSettings, validateSnapshot, verifyData,
} from '../scripts/firebase-migration-data.mts';

const time = '2026-01-02T03:04:05.123456789Z';
const manifestHash = 'a'.repeat(64);
const config = {
  sourceProjectId: 'migration-source', targetProjectId: 'migration-target',
  sourceDatabaseId: '(default)', targetDatabaseId: '(default)',
  gcloudConfiguration: 'test-profile', account: 'operator@example.invalid',
  gcloudConfigDir: path.resolve(os.tmpdir(), 'migration-profile'),
  snapshotDirectory: path.resolve(os.tmpdir(), 'migration-snapshots'),
};
const sourcePrefix = 'projects/migration-source/databases/(default)/documents';
const targetPrefix = 'projects/migration-target/databases/(default)/documents';
const anonymous = { localId: 'guest-1', createdAt: '1700000000000', lastLoginAt: '1700000001000', lastRefreshAt: time, validSince: '1700000000' };
const google = {
  localId: 'google-1', createdAt: '1700000000001', lastLoginAt: '1700000001001', email: 'owner@example.invalid', emailVerified: true,
  displayName: 'Fixture owner', initialEmail: 'owner@example.invalid', customAttributes: '{"editor":true,"level":2}',
  providerUserInfo: [{ providerId: 'google.com', rawId: 'provider-fixture', email: 'owner@example.invalid', displayName: 'Fixture owner', photoUrl: 'https://example.invalid/photo' }],
};
const doc = (name, fields = {}) => ({ path: name, fields, createTime: time, updateTime: time });
const snapshot = () => ({
  schemaVersion: 1, source: { projectId: config.sourceProjectId, databaseId: config.sourceDatabaseId }, capturedAt: time, readTime: time,
  documents: [doc('rooms/room-1', { amount: { integerValue: '9223372036854775807' } }),
    doc('users/guest-1/homes/home-1', { createdAt: { timestampValue: time }, owner: { referenceValue: `${sourcePrefix}/users/guest-1` } }),
    doc('users/guest-1/homes/home-1/revisions/revision-1', { empty: { mapValue: {} } }),
    doc('empty/exists')],
  users: [structuredClone(anonymous), structuredClone(google)],
});

function fakeStore(source = snapshot(), existingDocs = [], existingUsers = []) {
  const state = { source: structuredClone(source), docs: structuredClone(existingDocs), users: structuredClone(existingUsers), writes: [], reads: [], onDocument: undefined };
  const docsFor = project => project === config.sourceProjectId ? state.source.documents : state.docs;
  const pageOf = (items, field, token) => {
    const offset = token ? Number(token) : 0;
    return { [field]: items.slice(offset, offset + 1), ...(offset + 1 < items.length ? { nextPageToken: String(offset + 1) } : {}) };
  };
  const store = {
    async collectionIds(project, _database, parent, page, readTime) {
      state.reads.push({ method: 'collections', project, parent, readTime });
      const prefix = parent ? parent + '/' : '';
      const ids = [...new Set(docsFor(project).filter(item => item.path.startsWith(prefix)).map(item => item.path.slice(prefix.length).split('/')[0]))].sort();
      return pageOf(ids, 'collectionIds', page);
    },
    async documents(project, _database, collection, page, readTime) {
      state.reads.push({ method: 'documents', project, collection, readTime });
      const prefix = collection + '/';
      const paths = [...new Set(docsFor(project).filter(item => item.path.startsWith(prefix)).map(item => prefix + item.path.slice(prefix.length).split('/')[0]))].sort();
      const items = paths.map(name => {
        const existing = docsFor(project).find(item => item.path === name);
        return { name: `projects/${project}/databases/(default)/documents/${name}`, ...(existing ? { fields: existing.fields, createTime: existing.createTime ?? time, updateTime: existing.updateTime ?? time } : {}) };
      });
      return pageOf(items, 'documents', page);
    },
    async users(project, page) { return pageOf(project === config.sourceProjectId ? state.source.users : state.users, 'users', page); },
    async destinationReady() { state.reads.push({ method: 'ready' }); },
    async createUsers(users) {
      state.writes.push({ type: 'auth', count: users.length });
      for (const user of users) {
        assert.equal(state.users.some(item => item.localId === user.localId), false);
        state.users.push(structuredClone(user));
      }
    },
    async createDocument(document) {
      state.writes.push({ type: document.path.startsWith('firebaseMigrationUsers/') ? 'allowlist' : 'document', path: document.path });
      assert.equal(state.docs.some(item => item.path === document.path), false);
      state.docs.push({ ...structuredClone(document), createTime: time, updateTime: time });
      state.onDocument?.(document);
    },
  };
  return { store, state };
}

test('Firestore walker visits missing parents, every paginated subcollection, and empty existing documents', async () => {
  const { store, state } = fakeStore();
  const documents = await scanFirestore(store, config.sourceProjectId, '(default)', time);
  assert.equal(documents.length, 4);
  assert.ok(documents.some(item => item.path === 'users/guest-1/homes/home-1/revisions/revision-1'));
  assert.ok(documents.some(item => item.path === 'empty/exists' && Object.keys(item.fields).length === 0));
  assert.equal(documents.some(item => item.path === 'users/guest-1'), false);
  assert.ok(state.reads.some(item => item.parent === 'users/guest-1'));
  assert.ok(state.reads.filter(item => item.method !== 'ready').every(item => item.readTime === time));
});

test('typed Firestore values preserve int64 and nanosecond timestamps; only source-database references change', () => {
  const value = { mapValue: { fields: {
    integer: { integerValue: '9223372036854775807' }, timestamp: { timestampValue: time }, bytes: { bytesValue: 'AAEC/w==' },
    text: { stringValue: `${sourcePrefix}/rooms/room-1` }, reference: { referenceValue: `${sourcePrefix}/rooms/room-1` },
    other: { referenceValue: 'projects/other-project/databases/(default)/documents/a/b' },
    values: { arrayValue: { values: [{ nullValue: null }, { doubleValue: 'NaN' }, { booleanValue: false }] } },
    geo: { geoPointValue: { latitude: -12.4, longitude: 76.1 } },
  } } };
  const mapped = remapFirestoreValue(value, sourcePrefix, targetPrefix).mapValue.fields;
  assert.equal(mapped.integer.integerValue, '9223372036854775807');
  assert.equal(mapped.timestamp.timestampValue, time);
  assert.equal(mapped.text.stringValue, `${sourcePrefix}/rooms/room-1`);
  assert.equal(mapped.reference.referenceValue, `${targetPrefix}/rooms/room-1`);
  assert.equal(mapped.other.referenceValue, value.mapValue.fields.other.referenceValue);
  assert.deepEqual(mapped.values, value.mapValue.fields.values);
  assert.throws(() => remapFirestoreValue({ integerValue: '9223372036854775808' }, sourcePrefix, targetPrefix), /FIRESTORE_VALUE_INVALID/);
  assert.throws(() => remapFirestoreValue({ integerValue: '1', stringValue: '1' }, sourcePrefix, targetPrefix), /FIRESTORE_VALUE_INVALID/);
});

test('Auth import preserves UID, provider identity, claims, account flags and portable metadata', () => {
  const imported = importableUser({ ...google, disabled: true, validSince: '1700000000', lastRefreshAt: time });
  assert.equal(imported.localId, google.localId);
  assert.equal(imported.createdAt, google.createdAt);
  assert.equal(imported.lastLoginAt, google.lastLoginAt);
  assert.equal(imported.validSince, '1700000000');
  assert.equal(imported.lastRefreshAt, time);
  assert.equal(imported.disabled, true);
  assert.deepEqual(imported.providerUserInfo, google.providerUserInfo);
  assert.deepEqual(JSON.parse(imported.customAttributes), { editor: true, level: 2 });
  assert.deepEqual(stableUser(anonymous), stableUser({ ...anonymous, lastRefreshAt: '2026-02-02T00:00:00Z', disabled: false, emailVerified: false, validSince: '1800000000' }));
  for (const bad of [{ passwordHash: 'private-password-hash' }, { salt: 'private-salt' }, { tenantId: 'tenant' }, { mfaInfo: [{}] }, { emailLinkSignin: true }, { providerUserInfo: [{ providerId: 'password', rawId: 'x' }] }]) {
    assert.throws(() => importableUser({ ...anonymous, ...bad }), error => error.message === 'AUTH_ACCOUNT_UNSUPPORTED' && !error.message.includes('private'));
  }
});

test('before any write, reject unexpected destination documents, changed records and Auth ownership collisions', async () => {
  const source = snapshot();
  for (const existing of [
    { docs: [doc('extra/record')], users: [] },
    { docs: [doc('rooms/room-1', { amount: { integerValue: '4' } })], users: [] },
    { docs: [], users: [{ ...google, localId: 'another-user' }] },
    { docs: [], users: [{ ...google, displayName: 'Changed owner' }] },
  ]) {
    const { store, state } = fakeStore(source, existing.docs, existing.users);
    await assert.rejects(copyData(store, source, config, manifestHash), /DESTINATION_|AUTH_IDENTITY_COLLISION/);
    assert.equal(state.writes.length, 0);
  }
});

test('exact existing records resume safely and duplicate copy performs no writes', async () => {
  const source = snapshot();
  const mapped = mappedDocuments(source, config);
  const { store, state } = fakeStore(source, [mapped[0]], [source.users[0]]);
  const first = await copyData(store, source, config, manifestHash);
  assert.equal(first.verified, true);
  assert.equal(first.firestoreCount, 4);
  assert.equal(first.authCount, 2);
  assert.equal(first.allowlistCount, 2);
  assert.equal(state.writes.filter(item => item.type === 'document').length, 3);
  assert.equal(state.writes.filter(item => item.type === 'auth').length, 1);
  assert.deepEqual(state.writes.slice(-2).map(item => item.type), ['allowlist', 'allowlist']);
  const writes = state.writes.length;
  await copyData(store, source, config, manifestHash);
  assert.equal(state.writes.length, writes);
});

test('source edits before copy stop all writes; edits during copy withhold guest migration allowlist', async () => {
  const source = snapshot();
  const first = fakeStore(source);
  first.state.source.documents[0].fields.amount.integerValue = '3';
  await assert.rejects(copyData(first.store, source, config, manifestHash), /SOURCE_CHANGED_SINCE_SNAPSHOT/);
  assert.equal(first.state.writes.length, 0);
  const second = fakeStore(source);
  second.state.onDocument = () => { second.state.source.documents[0].fields.amount.integerValue = '3'; };
  await assert.rejects(copyData(second.store, source, config, manifestHash), /SOURCE_CHANGED_DURING_COPY/);
  assert.equal(second.state.writes.some(item => item.type === 'allowlist'), false);
});

test('failed Auth import never starts Firestore copy and can resume from exact partial success', async () => {
  const source = snapshot();
  const { store, state } = fakeStore(source);
  const create = store.createUsers;
  store.createUsers = async users => { await create(users.slice(0, 1)); throw new Error('simulated partial import'); };
  await assert.rejects(copyData(store, source, config, manifestHash), /simulated partial import/);
  assert.equal(state.docs.length, 0);
  store.createUsers = create;
  const result = await copyData(store, source, config, manifestHash);
  assert.equal(result.verified, true);
  assert.equal(state.users.length, 2);
});

test('verification covers every business path and exact allowlist values, including missing or changed records', async () => {
  const source = snapshot();
  const expected = [...mappedDocuments(source, config), ...migrationAllowlist(source, config, manifestHash)];
  const { store, state } = fakeStore(source, expected, source.users);
  assert.equal((await verifyData(store, source, config, manifestHash)).verified, true);
  state.docs.find(item => item.path.endsWith('revision-1')).fields = { changed: { booleanValue: true } };
  await assert.rejects(verifyData(store, source, config, manifestHash), /DESTINATION_DOCUMENT_COLLISION/);
  const missing = fakeStore(source, expected.slice(0, -1), source.users);
  await assert.rejects(verifyData(missing.store, source, config, manifestHash), /DESTINATION_DOCUMENTS_MISSING/);
  assert.throws(() => planDataCopy(source, expected, source.users, config, 'b'.repeat(64)), /DESTINATION_DOCUMENT_COLLISION/);
});

test('REST adapter fixes write targets and uses race-safe creation, bounded transport and sanitized failures', async () => {
  const calls = [];
  const store = createRestStore(config, 'secret-token-fixture', async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: 200 });
  });
  await store.createUsers([anonymous]);
  await store.createDocument(doc('rooms/room-1'));
  const auth = JSON.parse(calls[0].options.body);
  assert.equal(auth.allowOverwrite, false);
  assert.equal(auth.sanityCheck, true);
  assert.ok(calls[0].url.includes('/projects/migration-target/accounts:batchCreate'));
  const firestore = JSON.parse(calls[1].options.body);
  assert.deepEqual(firestore.writes[0].currentDocument, { exists: false });
  assert.equal(firestore.writes[0].update.name, `${targetPrefix}/rooms/room-1`);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers['X-Goog-User-Project'], 'migration-target');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.equal(call.url.includes('secret-token-fixture'), false);
  }
  await assert.rejects(store.documents('other-project', '(default)', 'rooms', '', ''), /REQUEST_PROJECT_MISMATCH/);
  const denied = createRestStore(config, 'secret-token-fixture', async () => new Response('private-user-and-token', { status: 409 }));
  await assert.rejects(denied.createDocument(doc('rooms/room-1')), error => error.message === 'DESTINATION_CREATE_CONFLICT');
  const partial = createRestStore(config, 'secret-token-fixture', async () => new Response(JSON.stringify({ error: [{ index: 0, message: 'private-details' }] })));
  await assert.rejects(partial.createUsers([anonymous]), error => error.message === 'AUTH_IMPORT_PARTIAL_FAILURE');
});

test('snapshot manifest binds exact private bytes, counts, target and immutable source snapshot', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'firebase-migration-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repository = path.join(directory, 'repository');
  fs.mkdirSync(repository);
  const privateConfig = { ...config, snapshotDirectory: path.join(directory, 'private') };
  const saved = saveSnapshot(snapshot(), privateConfig, repository);
  assert.deepEqual(snapshotSummary(loadSnapshot(saved.manifestFile, saved.manifestSha256, privateConfig, repository)), snapshotSummary(snapshot()));
  assert.throws(() => loadSnapshot(saved.manifestFile, 'b'.repeat(64), privateConfig, repository), /MANIFEST_MISMATCH/);
  assert.throws(() => loadSnapshot(saved.manifestFile, saved.manifestSha256, { ...privateConfig, targetProjectId: 'different-target' }, repository), /MANIFEST_MISMATCH/);
  assert.throws(() => externalPath(path.join(repository, 'secret.json'), repository), /PRIVATE_PATH_INSIDE_REPOSITORY/);
  const snapshotFile = path.join(path.dirname(saved.manifestFile), 'snapshot.json');
  fs.appendFileSync(snapshotFile, ' ');
  assert.throws(() => loadSnapshot(saved.manifestFile, saved.manifestSha256, privateConfig, repository), /SNAPSHOT_HASH_MISMATCH/);
  assert.equal(saved.manifestSha256, sha256(fs.readFileSync(saved.manifestFile)));
});

test('bounds, duplicate paths and traversal escapes fail closed', async () => {
  const source = snapshot();
  assert.throws(() => validateSnapshot({ ...source, documents: Array(5001).fill(source.documents[0]) }, config), /SNAPSHOT_INVALID/);
  assert.throws(() => validateSnapshot({ ...source, documents: [doc('../escape')] }, config), /SNAPSHOT_PATH_INVALID/);
  assert.throws(() => validateSnapshot({ ...source, documents: [doc('firebaseMigrationUsers/preexisting')] }, config), /SNAPSHOT_PATH_INVALID/);
  assert.throws(() => validateSnapshot({ ...source, users: [anonymous, anonymous] }, config), /AUTH_DUPLICATE_UID/);
  const { store } = fakeStore();
  store.collectionIds = async () => ({ collectionIds: [], nextPageToken: 'same-page' });
  await assert.rejects(scanFirestore(store, config.sourceProjectId, '(default)'), /PAGINATION_LOOP/);
  store.users = async () => ({ users: Array(1001).fill(anonymous) });
  await assert.rejects(scanAuth(store, config.sourceProjectId), /READ_LIMIT_EXCEEDED/);
});

test('private configuration verifies the named personal profile and explicit target project', () => {
  const operator = { backendProjectId: config.targetProjectId, firebaseProjectId: config.sourceProjectId, account: config.account, gcloudConfiguration: config.gcloudConfiguration };
  const vertex = { ...operator, projectId: config.targetProjectId, gcloudConfigDir: config.gcloudConfigDir };
  assert.deepEqual(validateMigrationSettings(config, operator, vertex), config);
  assert.throws(() => validateMigrationSettings({ ...config, account: 'other@example.invalid' }, operator, vertex), /AUTHORIZED_PROFILE_MISMATCH/);
  assert.throws(() => validateMigrationSettings({ ...config, sourceProjectId: 'unreviewed-source' }, operator, vertex), /AUTHORIZED_PROFILE_MISMATCH/);
  assert.deepEqual(validateMigrationSettings(config, { ...operator, firebaseProjectId: config.targetProjectId, firebaseMigrationSourceProjectId: config.sourceProjectId }, vertex), config);
  assert.throws(() => validateMigrationSettings({ ...config, sourceProjectId: config.targetProjectId }, operator, vertex), /CONFIG_INVALID/);
  assert.equal(canonicalJson({ b: 1, a: { d: 3, c: 2 } }), '{"a":{"c":2,"d":3},"b":1}');
});
