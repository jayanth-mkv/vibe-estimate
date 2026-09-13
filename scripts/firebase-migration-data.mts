import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Operator-only data migration. Infrastructure and the application write pause
// are managed separately. Source operations in this file are exclusively reads.
// REST typed values avoid rounding Firestore int64s or losing timestamp precision.
type JsonObject = Record<string, any>;
export type MigrationSettings = {
  sourceProjectId: string; targetProjectId: string;
  sourceDatabaseId: string; targetDatabaseId: string;
  gcloudConfiguration: string; account: string; gcloudConfigDir: string;
  snapshotDirectory: string;
};
type Document = { path: string; fields: JsonObject; createTime?: string; updateTime?: string };
type Snapshot = { schemaVersion: 1; source: { projectId: string; databaseId: string }; capturedAt: string; readTime: string; documents: Document[]; users: JsonObject[] };
type Page = JsonObject;
export type MigrationStore = {
  collectionIds(project: string, database: string, parent: string, page: string, readTime: string): Promise<Page>;
  documents(project: string, database: string, collection: string, page: string, readTime: string): Promise<Page>;
  users(project: string, page: string): Promise<Page>;
  destinationReady(): Promise<void>;
  createUsers(users: JsonObject[]): Promise<void>;
  createDocument(document: Document): Promise<void>;
};
const plain = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const canonicalJson = (value: any): string => JSON.stringify(value, (_key, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function fail(code: string): never { throw new MigrationError(code); }
export class MigrationError extends Error {
  constructor(code: string) { super(code); this.name = 'MigrationError'; }
}
const limits = Object.freeze({ documents: 5000, users: 1000, parents: 10000, calls: 30000, bytes: 64 * 1024 * 1024 });
const dbName = (project: string, database: string) => `projects/${project}/databases/${database}`;
const docsName = (project: string, database: string) => `${dbName(project, database)}/documents`;
const validSegment = (value: unknown) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1500 && !value.includes('/') && value !== '.' && value !== '..' && !/^__.*__$/.test(value);
function validDocPath(value: unknown): value is string {
  return typeof value === 'string' && value.split('/').length % 2 === 0 && value.split('/').length <= 200 && value.split('/').every(validSegment);
}
const settingsKeys = ['sourceProjectId', 'targetProjectId', 'sourceDatabaseId', 'targetDatabaseId', 'gcloudConfiguration', 'account', 'gcloudConfigDir', 'snapshotDirectory'];
export function validateMigrationSettings(value: unknown, operator: JsonObject, vertex: JsonObject): MigrationSettings {
  if (!plain(value) || Object.keys(value).length !== settingsKeys.length || settingsKeys.some(key => typeof value[key] !== 'string')) fail('CONFIG_INVALID');
  const config = value as MigrationSettings;
  const project = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  const database = (id: string) => id === '(default)' || /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(id);
  if (![config.sourceProjectId, config.targetProjectId].every(id => project.test(id) && !id.startsWith('demo-'))
    || config.sourceProjectId === config.targetProjectId || !database(config.sourceDatabaseId) || !database(config.targetDatabaseId)
    || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(config.gcloudConfiguration)
    || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(config.account)
    || /\.gserviceaccount\.com$/i.test(config.account) || !path.isAbsolute(config.gcloudConfigDir) || !path.isAbsolute(config.snapshotDirectory)) fail('CONFIG_INVALID');
  if (config.targetProjectId !== operator.backendProjectId || config.targetProjectId !== vertex.projectId
    || config.sourceProjectId !== (operator.firebaseMigrationSourceProjectId ?? operator.firebaseProjectId)
    || config.account !== operator.account || config.account !== vertex.account
    || config.gcloudConfiguration !== operator.gcloudConfiguration || config.gcloudConfiguration !== vertex.gcloudConfiguration
    || path.resolve(config.gcloudConfigDir) !== path.resolve(vertex.gcloudConfigDir)) fail('AUTHORIZED_PROFILE_MISMATCH');
  return config;
}

/** Validate every typed value before network writes, including nested values. */
export function remapFirestoreValue(value: unknown, sourcePrefix: string, targetPrefix: string, depth = 0): JsonObject {
  if (!plain(value) || Object.keys(value).length !== 1 || depth > 32) fail('FIRESTORE_VALUE_INVALID');
  const [kind, data] = Object.entries(value)[0];
  switch (kind) {
    case 'nullValue': if (data !== null && data !== 'NULL_VALUE') fail('FIRESTORE_VALUE_INVALID'); return { nullValue: null };
    case 'booleanValue': if (typeof data !== 'boolean') fail('FIRESTORE_VALUE_INVALID'); break;
    case 'integerValue': if (typeof data !== 'string' || !/^-?\d+$/.test(data) || BigInt(data) < -9223372036854775808n || BigInt(data) > 9223372036854775807n) fail('FIRESTORE_VALUE_INVALID'); break;
    case 'doubleValue': if (!(typeof data === 'number' && Number.isFinite(data)) && !['NaN', 'Infinity', '-Infinity'].includes(data)) fail('FIRESTORE_VALUE_INVALID'); break;
    case 'timestampValue': if (typeof data !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(data) || !Number.isFinite(Date.parse(data))) fail('FIRESTORE_VALUE_INVALID'); break;
    case 'stringValue': case 'bytesValue': if (typeof data !== 'string') fail('FIRESTORE_VALUE_INVALID'); break;
    case 'referenceValue': {
      if (typeof data !== 'string' || !/^projects\/[^/]+\/databases\/[^/]+\/documents\/.+/.test(data)) fail('FIRESTORE_VALUE_INVALID');
      return { referenceValue: data.startsWith(sourcePrefix + '/') ? targetPrefix + data.slice(sourcePrefix.length) : data };
    }
    case 'geoPointValue': if (!plain(data) || Object.keys(data).some(key => !['latitude', 'longitude'].includes(key)) || typeof data.latitude !== 'number' || typeof data.longitude !== 'number' || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude) || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) fail('FIRESTORE_VALUE_INVALID'); break;
    case 'arrayValue': {
      if (!plain(data) || Object.keys(data).some(key => key !== 'values') || (data.values !== undefined && !Array.isArray(data.values))) fail('FIRESTORE_VALUE_INVALID');
      return { arrayValue: { values: (data.values ?? []).map((item: unknown) => remapFirestoreValue(item, sourcePrefix, targetPrefix, depth + 1)) } };
    }
    case 'mapValue': {
      if (!plain(data) || Object.keys(data).some(key => key !== 'fields') || (data.fields !== undefined && !plain(data.fields))) fail('FIRESTORE_VALUE_INVALID');
      return { mapValue: { fields: remapFirestoreFields(data.fields ?? {}, sourcePrefix, targetPrefix, depth + 1) } };
    }
    default: fail('FIRESTORE_VALUE_UNSUPPORTED');
  }
  return { [kind]: data };
}
export function remapFirestoreFields(fields: unknown, sourcePrefix: string, targetPrefix: string, depth = 0): JsonObject {
  if (!plain(fields)) fail('FIRESTORE_FIELDS_INVALID');
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, remapFirestoreValue(value, sourcePrefix, targetPrefix, depth)]));
}

// No hash-configuration endpoint is ever queried. Only OAuth and anonymous
// accounts are supported; password/MFA/tenant/email-link accounts stop the run.
const authFields = ['localId', 'email', 'emailVerified', 'displayName', 'photoUrl', 'phoneNumber', 'disabled', 'createdAt', 'lastLoginAt', 'validSince', 'initialEmail', 'lastRefreshAt'];
const archivedAuthFields = ['language', 'timeZone', 'dateOfBirth', 'screenName', 'customAuth', 'passwordUpdatedAt', 'version'];
const providerFields = ['providerId', 'rawId', 'email', 'displayName', 'photoUrl', 'phoneNumber'];
export function importableUser(value: unknown): JsonObject {
  if (!plain(value) || typeof value.localId !== 'string' || value.localId.length < 1 || value.localId.length > 128 || !validSegment(value.localId)) fail('AUTH_USER_INVALID');
  if (value.passwordHash || value.salt || value.rawPassword || value.tenantId || (value.mfaInfo?.length ?? 0) > 0 || value.emailLinkSignin
    || value.providerUserInfo?.some((provider: JsonObject) => provider.providerId === 'password')) fail('AUTH_ACCOUNT_UNSUPPORTED');
  const output: JsonObject = {};
  for (const field of authFields) {
    if (value[field] === undefined) continue;
    const kind = ['disabled', 'emailVerified'].includes(field) ? 'boolean' : 'string';
    if (typeof value[field] !== kind) fail('AUTH_USER_INVALID');
    output[field] = value[field];
  }
  for (const field of ['createdAt', 'lastLoginAt', 'validSince']) if (output[field] !== undefined && !/^\d+$/.test(output[field])) fail('AUTH_USER_INVALID');
  if (!output.createdAt) fail('AUTH_CREATION_TIME_MISSING');
  if (value.customAttributes !== undefined) {
    if (typeof value.customAttributes !== 'string' || Buffer.byteLength(value.customAttributes) > 1000) fail('AUTH_CLAIMS_INVALID');
    let claims: unknown;
    try { claims = JSON.parse(value.customAttributes); } catch { fail('AUTH_CLAIMS_INVALID'); }
    if (!plain(claims)) fail('AUTH_CLAIMS_INVALID');
    output.customAttributes = canonicalJson(claims);
  }
  if (value.providerUserInfo !== undefined && !Array.isArray(value.providerUserInfo)) fail('AUTH_PROVIDER_INVALID');
  const providers = (value.providerUserInfo ?? []).map((provider: unknown) => {
    if (!plain(provider) || typeof provider.providerId !== 'string' || !provider.providerId || typeof provider.rawId !== 'string' || !provider.rawId) fail('AUTH_PROVIDER_INVALID');
    return Object.fromEntries(providerFields.filter(field => provider[field] !== undefined).map(field => {
      if (typeof provider[field] !== 'string') fail('AUTH_PROVIDER_INVALID');
      return [field, provider[field]];
    }));
  }).sort((a: JsonObject, b: JsonObject) => canonicalJson(a).localeCompare(canonicalJson(b)));
  if (providers.length) output.providerUserInfo = providers;
  return output;
}
export function stableUser(value: unknown): JsonObject {
  const user = importableUser(value);
  // These fields describe sessions within a specific Auth project; retain their
  // source values privately and send them to import, but do not claim that old
  // session tokens or automatic token-refresh bookkeeping move across projects.
  delete user.validSince;
  delete user.lastRefreshAt;
  user.disabled ??= false;
  user.emailVerified ??= false;
  if (user.customAttributes === '{}') delete user.customAttributes;
  return user;
}
function authIndex(users: JsonObject[]): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  const keys = new Map<string, string>();
  for (const raw of users) {
    const user = stableUser(raw);
    if (result.has(user.localId)) fail('AUTH_DUPLICATE_UID');
    result.set(user.localId, user);
    const identities = [user.email ? 'email:' + user.email.toLowerCase() : '', user.phoneNumber ? 'phone:' + user.phoneNumber : '',
      ...(user.providerUserInfo ?? []).map((provider: JsonObject) => `provider:${provider.providerId}:${provider.rawId}`)].filter(Boolean);
    for (const key of identities) {
      if (keys.has(key) && keys.get(key) !== user.localId) fail('AUTH_IDENTITY_COLLISION');
      keys.set(key, user.localId);
    }
  }
  return result;
}

async function paged(read: (page: string) => Promise<Page>, field: string, budget: { calls: number }, accept: (item: any) => void) {
  let page = '';
  const tokens = new Set<string>();
  do {
    if (++budget.calls > limits.calls) fail('READ_LIMIT_EXCEEDED');
    const result = await read(page);
    if (!plain(result) || (result[field] !== undefined && !Array.isArray(result[field])) || (result.nextPageToken !== undefined && typeof result.nextPageToken !== 'string')) fail('READ_RESPONSE_INVALID');
    for (const item of result[field] ?? []) accept(item);
    page = result.nextPageToken ?? '';
    if (page && tokens.has(page)) fail('PAGINATION_LOOP');
    tokens.add(page);
  } while (page);
}

/** showMissing is essential: existing users/{uid}/homes can have no user doc. */
export async function scanFirestore(store: MigrationStore, project: string, database: string, readTime = ''): Promise<Document[]> {
  const prefix = docsName(project, database) + '/';
  const queue = [''];
  const visited = new Set(['']);
  const docs = new Map<string, Document>();
  const budget = { calls: 0 };
  let bytes = 0;
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];
    const collections: string[] = [];
    await paged(page => store.collectionIds(project, database, parent, page, readTime), 'collectionIds', budget, id => {
      if (!validSegment(id) || collections.includes(id)) fail('COLLECTION_RESPONSE_INVALID');
      collections.push(id);
      if (collections.length > limits.parents) fail('READ_LIMIT_EXCEEDED');
    });
    for (const id of collections.sort()) {
      const collection = parent ? `${parent}/${id}` : id;
      await paged(page => store.documents(project, database, collection, page, readTime), 'documents', budget, document => {
        if (!plain(document) || typeof document.name !== 'string' || !document.name.startsWith(prefix)) fail('DOCUMENT_RESPONSE_INVALID');
        const relative = document.name.slice(prefix.length);
        if (!validDocPath(relative) || relative.split('/').slice(0, -1).join('/') !== collection || visited.has(relative)) fail('DOCUMENT_RESPONSE_INVALID');
        visited.add(relative);
        queue.push(relative);
        if (visited.size > limits.parents) fail('READ_LIMIT_EXCEEDED');
        // Missing ancestors have only a name; their descendants are still read.
        if (document.createTime === undefined && document.updateTime === undefined && document.fields === undefined) return;
        if (typeof document.createTime !== 'string' || typeof document.updateTime !== 'string') fail('DOCUMENT_RESPONSE_INVALID');
        const fields = remapFirestoreFields(document.fields ?? {}, prefix.slice(0, -1), prefix.slice(0, -1));
        const item = { path: relative, fields, createTime: document.createTime, updateTime: document.updateTime };
        bytes += Buffer.byteLength(canonicalJson(item));
        docs.set(relative, item);
        if (docs.size > limits.documents || bytes > limits.bytes) fail('READ_LIMIT_EXCEEDED');
      });
    }
  }
  return [...docs.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export async function scanAuth(store: MigrationStore, project: string): Promise<JsonObject[]> {
  const users: JsonObject[] = [];
  let bytes = 0;
  await paged(page => store.users(project, page), 'users', { calls: 0 }, user => {
    importableUser(user);
    users.push(user);
    bytes += Buffer.byteLength(canonicalJson(user));
    if (users.length > limits.users || bytes > limits.bytes) fail('READ_LIMIT_EXCEEDED');
  });
  authIndex(users);
  return users.sort((a, b) => a.localId.localeCompare(b.localId));
}
const firestoreDigest = (documents: Document[]) => sha256(canonicalJson(documents.map(doc => ({ path: doc.path, fields: remapFirestoreFields(doc.fields, '\0', '\0') })).sort((a, b) => a.path.localeCompare(b.path))));
const authDigest = (users: JsonObject[]) => sha256(canonicalJson(users.map(stableUser).sort((a, b) => a.localId.localeCompare(b.localId))));
export function snapshotSummary(snapshot: Snapshot) {
  return { firestoreCount: snapshot.documents.length, authCount: snapshot.users.length, firestoreSha256: firestoreDigest(snapshot.documents), authSha256: authDigest(snapshot.users) };
}
export function validateSnapshot(value: unknown, settings: MigrationSettings): Snapshot {
  if (!plain(value) || value.schemaVersion !== 1 || value.source?.projectId !== settings.sourceProjectId || value.source?.databaseId !== settings.sourceDatabaseId
    || typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt)) || typeof value.readTime !== 'string' || !Number.isFinite(Date.parse(value.readTime))
    || !Array.isArray(value.documents) || value.documents.length > limits.documents || !Array.isArray(value.users) || value.users.length > limits.users) fail('SNAPSHOT_INVALID');
  const names = new Set();
  const prefix = docsName(settings.sourceProjectId, settings.sourceDatabaseId);
  for (const document of value.documents) {
    if (!plain(document) || !validDocPath(document.path) || names.has(document.path) || document.path.startsWith('firebaseMigrationUsers/')) fail('SNAPSHOT_PATH_INVALID');
    names.add(document.path);
    remapFirestoreFields(document.fields, prefix, prefix);
    for (const field of ['createTime', 'updateTime']) if (typeof document[field] !== 'string' || !Number.isFinite(Date.parse(document[field]))) fail('SNAPSHOT_INVALID');
  }
  authIndex(value.users);
  if (Buffer.byteLength(canonicalJson(value)) > limits.bytes) fail('SNAPSHOT_TOO_LARGE');
  return value as Snapshot;
}
export async function captureSnapshot(store: MigrationStore, settings: MigrationSettings): Promise<Snapshot> {
  // One readTime covers the entire Firestore hierarchy. Auth exposes pagination,
  // not read-time snapshots; copy independently rechecks source identity state.
  const capturedAt = new Date().toISOString();
  const readTime = new Date(Date.now() - 5000).toISOString();
  const documents = await scanFirestore(store, settings.sourceProjectId, settings.sourceDatabaseId, readTime);
  const users = await scanAuth(store, settings.sourceProjectId);
  return validateSnapshot({ schemaVersion: 1, source: { projectId: settings.sourceProjectId, databaseId: settings.sourceDatabaseId }, capturedAt, readTime, documents, users }, settings);
}
export function mappedDocuments(snapshot: Snapshot, settings: MigrationSettings): Document[] {
  const source = docsName(settings.sourceProjectId, settings.sourceDatabaseId);
  const target = docsName(settings.targetProjectId, settings.targetDatabaseId);
  return snapshot.documents.map(doc => ({ path: doc.path, fields: remapFirestoreFields(doc.fields, source, target) }));
}
export function migrationAllowlist(snapshot: Snapshot, settings: MigrationSettings, manifestHash: string): Document[] {
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) fail('MANIFEST_HASH_INVALID');
  return snapshot.users.map(user => ({ path: `firebaseMigrationUsers/${user.localId}`, fields: {
    sourceProjectId: { stringValue: settings.sourceProjectId }, sourceUid: { stringValue: user.localId },
    targetUid: { stringValue: user.localId }, snapshotSha256: { stringValue: manifestHash },
  } }));
}
function compareDocuments(expected: Document[], actual: Document[], complete: boolean): Document[] {
  const wanted = new Map(expected.map(doc => [doc.path, doc]));
  const found = new Set<string>();
  for (const doc of actual) {
    const original = wanted.get(doc.path);
    if (!original || found.has(doc.path) || canonicalJson(original.fields) !== canonicalJson(doc.fields)) fail('DESTINATION_DOCUMENT_COLLISION');
    found.add(doc.path);
  }
  const missing = expected.filter(doc => !found.has(doc.path));
  if (complete && missing.length) fail('DESTINATION_DOCUMENTS_MISSING');
  return missing;
}
function compareUsers(expected: JsonObject[], actual: JsonObject[], complete: boolean): JsonObject[] {
  const wanted = authIndex(expected);
  const found = authIndex(actual);
  // Detect duplicate email/provider ownership before attempting any writes.
  authIndex([...expected, ...actual.filter(user => !wanted.has(user.localId))]);
  for (const [uid, user] of found) {
    if (!wanted.has(uid) || canonicalJson(wanted.get(uid)) !== canonicalJson(user)) fail('DESTINATION_AUTH_COLLISION');
  }
  const missing = expected.filter(user => !found.has(user.localId));
  if (complete && missing.length) fail('DESTINATION_USERS_MISSING');
  return missing.map(importableUser);
}
export function planDataCopy(snapshot: Snapshot, targetDocuments: Document[], targetUsers: JsonObject[], settings: MigrationSettings, manifestHash: string) {
  validateSnapshot(snapshot, settings);
  const documents = mappedDocuments(snapshot, settings);
  const allowlist = migrationAllowlist(snapshot, settings, manifestHash);
  const pending = compareDocuments([...documents, ...allowlist], targetDocuments, false);
  return { documents: pending.filter(doc => !doc.path.startsWith('firebaseMigrationUsers/')), allowlist: pending.filter(doc => doc.path.startsWith('firebaseMigrationUsers/')), users: compareUsers(snapshot.users, targetUsers, false) };
}
export async function verifyData(store: MigrationStore, snapshot: Snapshot, settings: MigrationSettings, manifestHash: string, includeAllowlist = true) {
  validateSnapshot(snapshot, settings);
  const documents = await scanFirestore(store, settings.targetProjectId, settings.targetDatabaseId);
  const users = await scanAuth(store, settings.targetProjectId);
  const wanted = mappedDocuments(snapshot, settings);
  const expectedAllowlist = migrationAllowlist(snapshot, settings, manifestHash);
  // Existing exact allowlist documents are permitted while resuming a partial
  // allowlist stage, but all business records must already be present.
  compareDocuments(wanted, documents.filter(doc => !doc.path.startsWith('firebaseMigrationUsers/')), true);
  compareDocuments(expectedAllowlist, documents.filter(doc => doc.path.startsWith('firebaseMigrationUsers/')), includeAllowlist);
  compareUsers(snapshot.users, users, true);
  return { firestoreCount: wanted.length, authCount: users.length, allowlistCount: documents.length - wanted.length,
    firestoreSha256: firestoreDigest(wanted), authSha256: authDigest(users), verified: true };
}
export async function copyData(store: MigrationStore, snapshot: Snapshot, settings: MigrationSettings, manifestHash: string) {
  validateSnapshot(snapshot, settings);
  await store.destinationReady();
  // Reject a stale reviewed snapshot before any destination mutations. This
  // catches API writes, newly created users and changed identity data after freeze.
  const currentSourceSummary = async () => snapshotSummary({ ...snapshot,
    documents: await scanFirestore(store, settings.sourceProjectId, settings.sourceDatabaseId),
    users: await scanAuth(store, settings.sourceProjectId),
  });
  if (canonicalJson(await currentSourceSummary()) !== canonicalJson(snapshotSummary(snapshot))) fail('SOURCE_CHANGED_SINCE_SNAPSHOT');
  const targetDocuments = await scanFirestore(store, settings.targetProjectId, settings.targetDatabaseId);
  const targetUsers = await scanAuth(store, settings.targetProjectId);
  const plan = planDataCopy(snapshot, targetDocuments, targetUsers, settings, manifestHash);
  // Both destinations were checked before the first write. Server preconditions
  // also reject races: Auth allowOverwrite:false, Firestore exists:false.
  for (let start = 0; start < plan.users.length; start += 100) await store.createUsers(plan.users.slice(start, start + 100));
  for (const document of plan.documents) await store.createDocument(document);
  await verifyData(store, snapshot, settings, manifestHash, false);
  // A source edit during copy must be resolved before granting bridge access.
  if (canonicalJson(await currentSourceSummary()) !== canonicalJson(snapshotSummary(snapshot))) fail('SOURCE_CHANGED_DURING_COPY');
  for (const document of plan.allowlist) await store.createDocument(document);
  return verifyData(store, snapshot, settings, manifestHash);
}

// REST listDocuments showMissing/readTime and Auth batchCreate documented at:
// https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/list
// https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/batchCreate
export function createRestStore(settings: MigrationSettings, token: string, request: typeof fetch = fetch): MigrationStore {
  const encoded = (name: string) => name.split('/').map(encodeURIComponent).join('/');
  let calls = 0;
  const call = async (service: 'firestore' | 'identitytoolkit', resource: string, method = 'GET', body?: unknown): Promise<JsonObject> => {
    if (++calls > limits.calls * 4) fail('READ_LIMIT_EXCEEDED');
    let response: Response;
    try {
      response = await request(`https://${service}.googleapis.com/${resource}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': settings.targetProjectId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
    } catch { fail('GOOGLE_REQUEST_UNAVAILABLE'); }
    if (!response.ok) fail(response.status === 409 ? 'DESTINATION_CREATE_CONFLICT' : `GOOGLE_HTTP_${response.status}`);
    const raw = await response.text();
    if (Buffer.byteLength(raw) > limits.bytes) fail('READ_LIMIT_EXCEEDED');
    let result: unknown;
    try { result = JSON.parse(raw); } catch { fail('READ_RESPONSE_INVALID'); }
    if (!plain(result)) fail('READ_RESPONSE_INVALID');
    return result;
  };
  const assertProject = (project: string, database?: string) => {
    if (project !== settings.sourceProjectId && project !== settings.targetProjectId) fail('REQUEST_PROJECT_MISMATCH');
    if (database !== undefined && database !== (project === settings.sourceProjectId ? settings.sourceDatabaseId : settings.targetDatabaseId)) fail('REQUEST_DATABASE_MISMATCH');
  };
  return {
    async collectionIds(project, database, parent, page, readTime) {
      assertProject(project, database);
      if (parent && !validDocPath(parent)) fail('REQUEST_PATH_INVALID');
      return call('firestore', `v1/${encoded(docsName(project, database) + (parent ? '/' + parent : ''))}:listCollectionIds`, 'POST', {
        pageSize: 100, ...(page ? { pageToken: page } : {}), ...(readTime ? { readTime } : {}),
      });
    },
    async documents(project, database, collection, page, readTime) {
      assertProject(project, database);
      if (collection.split('/').length % 2 !== 1 || !collection.split('/').every(validSegment)) fail('REQUEST_PATH_INVALID');
      const query = new URLSearchParams({ pageSize: '100', showMissing: 'true', ...(page ? { pageToken: page } : {}), ...(readTime ? { readTime } : {}) });
      return call('firestore', `v1/${encoded(docsName(project, database) + '/' + collection)}?${query}`);
    },
    async users(project, page) {
      assertProject(project);
      // A field mask avoids copying undocumented output. Password material is
      // only detected in memory and causes an immediate, sanitized stop.
      const fields = [...authFields, ...archivedAuthFields, 'customAttributes', 'providerUserInfo', 'passwordHash', 'salt', 'mfaInfo', 'tenantId', 'emailLinkSignin'];
      const query = new URLSearchParams({ maxResults: '1000', fields: `users(${fields.join(',')}),nextPageToken`, ...(page ? { nextPageToken: page } : {}) });
      return call('identitytoolkit', `v1/projects/${settings.sourceProjectId === project ? settings.sourceProjectId : settings.targetProjectId}/accounts:batchGet?${query}`);
    },
    async destinationReady() {
      const database = await call('firestore', `v1/${encoded(dbName(settings.targetProjectId, settings.targetDatabaseId))}?fields=name,type`);
      if (database.name !== dbName(settings.targetProjectId, settings.targetDatabaseId) || database.type !== 'FIRESTORE_NATIVE') fail('DESTINATION_DATABASE_NOT_READY');
      const auth = await call('identitytoolkit', `admin/v2/projects/${settings.targetProjectId}/config?fields=name`);
      if (auth.name !== `projects/${settings.targetProjectId}/config` && !/^projects\/\d+\/config$/.test(auth.name ?? '')) fail('DESTINATION_AUTH_NOT_READY');
      // Numeric API resource names are safe only because the explicit project
      // route is already fixed; no values from this response select write paths.
    },
    async createUsers(users) {
      if (!users.length || users.length > 100) fail('AUTH_BATCH_INVALID');
      const result = await call('identitytoolkit', `v1/projects/${settings.targetProjectId}/accounts:batchCreate`, 'POST', {
        users: users.map(importableUser), allowOverwrite: false, sanityCheck: true,
      });
      if (result.error?.length || result.errors?.length) fail('AUTH_IMPORT_PARTIAL_FAILURE');
    },
    async createDocument(document) {
      if (!validDocPath(document.path)) fail('REQUEST_PATH_INVALID');
      const prefix = docsName(settings.targetProjectId, settings.targetDatabaseId);
      await call('firestore', `v1/${encoded(prefix)}:commit`, 'POST', { writes: [{
        update: { name: prefix + '/' + document.path, fields: remapFirestoreFields(document.fields, prefix, prefix) }, currentDocument: { exists: false },
      }] });
    },
  };
}

export function externalPath(filename: string, repositoryRoot: string): string {
  const absolute = path.resolve(filename);
  const relative = path.relative(repositoryRoot, absolute);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) fail('PRIVATE_PATH_INSIDE_REPOSITORY');
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) fail('LINKED_PRIVATE_PATH'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
  }
  return absolute;
}
const readJsonFile = (filename: string, maxBytes = limits.bytes): { value: any; bytes: Buffer } => {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > maxBytes) fail('PRIVATE_FILE_INVALID');
  const bytes = fs.readFileSync(filename);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('PRIVATE_JSON_INVALID'); }
  return { value, bytes };
};
export function saveSnapshot(snapshot: Snapshot, settings: MigrationSettings, repositoryRoot: string) {
  validateSnapshot(snapshot, settings);
  const directory = externalPath(settings.snapshotDirectory, repositoryRoot);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const runDirectory = externalPath(path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`), repositoryRoot);
  fs.mkdirSync(runDirectory, { mode: 0o700 });
  const snapshotText = canonicalJson(snapshot);
  fs.writeFileSync(path.join(runDirectory, 'snapshot.json'), snapshotText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  const manifest = { schemaVersion: 1, source: snapshot.source, target: { projectId: settings.targetProjectId, databaseId: settings.targetDatabaseId },
    capturedAt: snapshot.capturedAt, readTime: snapshot.readTime, snapshotFile: 'snapshot.json', snapshotSha256: sha256(snapshotText), ...snapshotSummary(snapshot) };
  const manifestText = canonicalJson(manifest);
  const manifestFile = path.join(runDirectory, 'manifest.json');
  fs.writeFileSync(manifestFile, manifestText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { manifestFile, manifestSha256: sha256(manifestText), ...snapshotSummary(snapshot) };
}
export function loadSnapshot(manifestFile: string, expectedHash: string, settings: MigrationSettings, repositoryRoot: string): Snapshot {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) fail('MANIFEST_HASH_INVALID');
  const filename = externalPath(manifestFile, repositoryRoot);
  const directory = externalPath(settings.snapshotDirectory, repositoryRoot);
  const relative = path.relative(directory, filename);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('MANIFEST_PATH_INVALID');
  const { value: manifest, bytes } = readJsonFile(filename, 100_000);
  if (sha256(bytes) !== expectedHash || !plain(manifest) || manifest.schemaVersion !== 1 || manifest.snapshotFile !== 'snapshot.json'
    || manifest.source?.projectId !== settings.sourceProjectId || manifest.source?.databaseId !== settings.sourceDatabaseId
    || manifest.target?.projectId !== settings.targetProjectId || manifest.target?.databaseId !== settings.targetDatabaseId) fail('MANIFEST_MISMATCH');
  const snapshotFile = externalPath(path.join(path.dirname(filename), manifest.snapshotFile), repositoryRoot);
  const loaded = readJsonFile(snapshotFile);
  if (sha256(loaded.bytes) !== manifest.snapshotSha256) fail('SNAPSHOT_HASH_MISMATCH');
  const snapshot = validateSnapshot(loaded.value, settings);
  const summary = snapshotSummary(snapshot);
  if (manifest.capturedAt !== snapshot.capturedAt || manifest.readTime !== snapshot.readTime
    || Object.entries(summary).some(([key, value]) => manifest[key] !== value)) fail('SNAPSHOT_SUMMARY_MISMATCH');
  return snapshot;
}

async function main() {
  const [action, ...arguments_] = process.argv.slice(2);
  if (!['inventory', 'backup', 'copy', 'verify'].includes(action)) fail('USAGE_INVALID');
  const flags: Record<string, string> = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!['--config', '--manifest', '--expect-sha256'].includes(key) || !value || value.startsWith('--') || flags[key]) fail('USAGE_INVALID');
    flags[key] = value;
  }
  const needsSnapshot = ['copy', 'verify'].includes(action);
  if (!flags['--config'] || needsSnapshot !== !!flags['--manifest'] || needsSnapshot !== !!flags['--expect-sha256']) fail('USAGE_INVALID');
  const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (fs.realpathSync(process.cwd()) !== root) fail('REPOSITORY_ROOT_REQUIRED');
  const privateRoot = externalPath(path.resolve(root, '../docs/private'), root);
  const operator = readJsonFile(externalPath(path.join(privateRoot, 'local-config.json'), root), 100_000).value;
  const vertex = readJsonFile(externalPath(path.join(privateRoot, 'vertex-local.json'), root), 100_000).value;
  const settings = validateMigrationSettings(readJsonFile(externalPath(flags['--config'], root), 100_000).value, operator, vertex);
  externalPath(settings.gcloudConfigDir, root);
  externalPath(settings.snapshotDirectory, root);
  const snapshot = needsSnapshot ? loadSnapshot(flags['--manifest'], flags['--expect-sha256'], settings, root) : undefined;
  const adcFile = path.join(settings.gcloudConfigDir, 'application_default_credentials.json');
  const adcHash = () => fs.existsSync(adcFile) ? sha256(fs.readFileSync(adcFile)) : 'absent';
  const before = adcHash();
  let token = '';
  try {
    const { obtainNamedProfileToken } = await import('../backend/dist/vertex-auth.js');
    token = await obtainNamedProfileToken({ projectId: settings.targetProjectId, gcloudConfiguration: settings.gcloudConfiguration, gcloudAccount: settings.account, gcloudConfigDir: settings.gcloudConfigDir });
    const store = createRestStore(settings, token);
    if (action === 'inventory' || action === 'backup') {
      const captured = await captureSnapshot(store, settings);
      if (action === 'backup') {
        const saved = saveSnapshot(captured, settings, root);
        // Only the run-directory basename is public; snapshot paths, identifiers,
        // emails, provider details, contents and raw failures never reach logs.
        console.log(JSON.stringify({ action, ok: true, snapshotRun: path.basename(path.dirname(saved.manifestFile)), manifestSha256: saved.manifestSha256, ...snapshotSummary(captured) }));
      } else console.log(JSON.stringify({ action, ok: true, ...snapshotSummary(captured), anonymousCount: captured.users.filter(user => !(user.providerUserInfo?.length)).length }));
    } else {
      const result = action === 'copy' ? await copyData(store, snapshot!, settings, flags['--expect-sha256']) : await verifyData(store, snapshot!, settings, flags['--expect-sha256']);
      console.log(JSON.stringify({ action, ok: true, manifestSha256: flags['--expect-sha256'], ...result }));
    }
  } finally {
    token = '';
    const unchanged = before === adcHash();
    console.log(JSON.stringify({ sharedAdcUnchanged: unchanged }));
    if (!unchanged) process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Firebase migration stopped: ${error instanceof MigrationError ? error.message : 'PRIVATE_OPERATION_FAILED'}. Raw errors and private values omitted.`); process.exitCode = 1; });
}
