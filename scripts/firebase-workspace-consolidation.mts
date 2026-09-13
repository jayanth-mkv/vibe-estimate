import { canonicalJson, importableUser, remapFirestoreFields, sha256, validateSnapshot, type MigrationSettings } from './firebase-migration-data.mts';

type Fields = Record<string, any>;
export type WorkspaceDocument = { path: string; fields: Fields; updateTime?: string; createTime?: string };
type SourceSnapshot = ReturnType<typeof validateSnapshot>;
type Change = { path: string; fields: Fields; beforeHash: string | null; updateTime?: string };
const indexRoots = new Set(['homeOwners', 'roomOwners', 'homeRoomOwners', 'designAssistants']);
const object = (value: any): value is Fields => !!value && typeof value === 'object' && !Array.isArray(value);
function require(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
const string = (value: any): string => { require(typeof value?.stringValue === 'string', 'STRING_REQUIRED'); return value.stringValue; };
const map = (value: any): Fields => { require(object(value?.mapValue) && (value.mapValue.fields === undefined || object(value.mapValue.fields)), 'MAP_REQUIRED'); return value.mapValue.fields ?? {}; };
const strings = (value: any): string[] => { require(object(value?.arrayValue), 'ARRAY_REQUIRED'); return (value.arrayValue.values ?? []).map(string); };
const number = (value: any): number => { const n = Number(value?.integerValue); require(Number.isSafeInteger(n) && n >= 0, 'COUNTER_INVALID'); return n; };
const uid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const documentHash = (doc: Pick<WorkspaceDocument, 'fields'>) => sha256(canonicalJson(remapFirestoreFields(doc.fields, '\0', '\0')));
export function typed(value: any): Fields {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') { require(Number.isSafeInteger(value), 'INTEGER_REQUIRED'); return { integerValue: String(value) }; }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(typed) } };
  require(object(value), 'OBJECT_REQUIRED');
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typed(v)])) } };
}
function unique(values: string[], code: string) { require(new Set(values).size === values.length, code); return values; }
function mergeMaps(destination: Fields, incoming: Fields) {
  for (const [key, value] of Object.entries(incoming)) {
    require(!Object.hasOwn(destination, key), 'INDEX_KEY_COLLISION');
    destination[key] = structuredClone(value);
  }
}
function keys(fields: Fields, allowed: string[]) { require(Object.keys(fields).every(key => allowed.includes(key)), 'INDEX_FIELDS_UNSUPPORTED'); }
function ensureDocumentMap(documents: WorkspaceDocument[]) {
  const result = new Map<string, WorkspaceDocument>();
  for (const doc of documents) {
    require(typeof doc.path === 'string' && doc.path.split('/').length % 2 === 0
      && doc.path.split('/').every(part => part && part !== '.' && part !== '..' && Buffer.byteLength(part) <= 1500)
      && !result.has(doc.path), 'DOCUMENT_PATH_INVALID');
    result.set(doc.path, { ...doc, fields: remapFirestoreFields(doc.fields, '\0', '\0') });
  }
  return result;
}

/** Validate discoverability and immutable revision links, without changing history. */
export function validateWorkspaceGraph(documents: WorkspaceDocument[], owner: string) {
  const docs = ensureDocumentMap(documents);
  const get = (name: string) => { const doc = docs.get(name); require(doc, 'DANGLING_DOCUMENT'); return doc.fields; };
  const homes = documents.filter(doc => doc.path.startsWith(`users/${owner}/homes/`) && doc.path.split('/').length === 4);
  const projects = documents.filter(doc => doc.path.startsWith(`users/${owner}/projects/`) && doc.path.split('/').length === 4);
  const rooms = documents.filter(doc => doc.path.startsWith('rooms/') && doc.fields.ownerId?.stringValue === owner);
  const homeIndex = docs.has(`homeOwners/${owner}`) ? get(`homeOwners/${owner}`) : { homeIds: typed([]), creations: typed({}) };
  const homeIds = unique(strings(homeIndex.homeIds), 'DUPLICATE_HOME');
  require(canonicalJson([...homeIds].sort()) === canonicalJson(homes.map(doc => doc.path.split('/')[3]).sort()), 'HOME_INDEX_MISMATCH');
  for (const value of Object.values(map(homeIndex.creations))) require(homeIds.includes(string(value)), 'HOME_RECEIPT_DANGLING');
  const roomIndex = docs.has(`roomOwners/${owner}`) ? map(get(`roomOwners/${owner}`).projects) : {};
  require(Object.keys(roomIndex).length === rooms.length, 'ROOM_INDEX_MISMATCH');
  for (const [projectId, roomId] of Object.entries(roomIndex)) {
    get(`users/${owner}/projects/${projectId}`);
    const room = get(`rooms/${string(roomId)}`);
    require(string(room.ownerId) === owner && string(room.projectId) === projectId, 'ROOM_INDEX_MISMATCH');
  }
  let revisions = 0;
  for (const doc of [...homes, ...projects]) require(string(doc.fields.ownerId) === owner && string(doc.fields.id) === doc.path.split('/')[3], 'OWNER_MISMATCH');
  for (const doc of homes) {
    const f = doc.fields;
    const revision = (id: string) => {
      const value = get(`${doc.path}/revisions/${id}`);
      let parsed: any;
      try { parsed = JSON.parse(string(value.content)); } catch { throw new Error('REVISION_INTEGRITY_FAILED'); }
      require(object(parsed), 'REVISION_INTEGRITY_FAILED');
      require(parsed.id === id && sha256(JSON.stringify({ ...parsed, createdAt: '' })) === string(value.hash), 'REVISION_INTEGRITY_FAILED');
    };
    if (f.headRevisionId?.stringValue) revision(string(f.headRevisionId));
    for (const item of f.revisions?.arrayValue?.values ?? []) {
      const summary = map(item); revision(string(summary.id)); revisions++;
      if (summary.parentRevisionId?.stringValue) revision(string(summary.parentRevisionId));
    }
    if (f.proposalProjectId?.stringValue) get(`users/${owner}/projects/${string(f.proposalProjectId)}`);
    if (f.roomId?.stringValue) require(string(get(`homeRooms/${string(f.roomId)}`).homeId) === string(f.id), 'HOME_ROOM_MISMATCH');
    for (const receipt of Object.values(map(f.receipts))) {
      const saved = map(receipt);
      if (saved.revisionId) revision(string(saved.revisionId));
      if (saved.projectId) get(`users/${owner}/projects/${string(saved.projectId)}`);
    }
    for (const entry of Object.values(map(f.jobs))) {
      const job = map(entry);
      for (const key of ['baseRevisionId', 'resultRevisionId', 'stagedRevisionId']) if (job[key]) revision(string(job[key]));
      if (job.resultSummaryId) get(`${doc.path}/${string(job.kind) === 'agreement' ? 'agreementProse' : 'summaries'}/${string(job.resultSummaryId)}`);
    }
  }
  for (const doc of projects) if (doc.fields.roomId) get(`rooms/${string(doc.fields.roomId)}`);
  for (const doc of rooms) {
    const f = doc.fields;
    require(string(f.id) === doc.path.split('/')[1] && f.clientId?.stringValue !== owner, 'ROOM_IDENTITY_COLLAPSE');
    get(`users/${owner}/projects/${string(f.projectId)}`);
    if (f.homeId) get(`users/${owner}/homes/${string(f.homeId)}`);
    if (f.draftProjectId) get(`users/${owner}/projects/${string(f.draftProjectId)}`);
    // Review snapshots reserve a project ID before prepare-draft materializes it.
    // Explicitly shared drafts must already have their persisted project.
    for (const value of f.sharedDrafts?.arrayValue?.values ?? []) get(`users/${owner}/projects/${string(map(value).projectId)}`);
  }
  const links = documents.filter(doc => doc.path.startsWith('homeRooms/') && doc.fields.ownerId?.stringValue === owner);
  const linkIndex = docs.has(`homeRoomOwners/${owner}`) ? map(get(`homeRoomOwners/${owner}`).homes) : {};
  const assistants = docs.has(`designAssistants/${owner}`) ? get(`designAssistants/${owner}`) : { profiles: typed({}), receipts: typed({}) };
  const profiles = map(assistants.profiles);
  require(Object.keys(profiles).length <= 12, 'ASSISTANT_LIMIT');
  for (const [id, value] of Object.entries(profiles)) {
    const profile = map(value);
    require(string(profile.id) === id && string(profile.ownerId) === owner, 'ASSISTANT_OWNER_MISMATCH');
  }
  for (const receipt of Object.values(map(assistants.receipts))) require(Object.hasOwn(profiles, string(map(receipt).id)), 'ASSISTANT_RECEIPT_DANGLING');
  require(Object.keys(linkIndex).length === links.length, 'HOME_ROOM_INDEX_MISMATCH');
  for (const doc of links) {
    const f = doc.fields, roomId = string(f.roomId), homeId = string(f.homeId);
    require(doc.path === `homeRooms/${roomId}` && string(linkIndex[homeId]) === roomId && string(get(`rooms/${roomId}`).ownerId) === owner
      && string(get(`users/${owner}/homes/${homeId}`).roomId) === roomId, 'HOME_ROOM_MISMATCH');
    if (f.assistantId) require(Object.hasOwn(profiles, string(f.assistantId)), 'ASSISTANT_LINK_DANGLING');
  }
  require(homes.length <= 20 && projects.length <= 100, 'WORKSPACE_LIST_LIMIT');
  return { homes: homes.length, projects: projects.length, rooms: rooms.length, revisions, sharedHomes: links.length };
}

/** Explicit operator-requested ownership transfer. No network or Auth writes. */
export function planWorkspaceConsolidation(input: {
  source: SourceSnapshot; settings: MigrationSettings; sourceManifestSha256: string;
  targetDocuments: WorkspaceDocument[]; targetUsers: Fields[]; targetUid: string;
}) {
  const { settings, targetUid: owner } = input;
  const source = validateSnapshot(input.source, settings);
  require(uid(owner) && /^[a-f0-9]{64}$/.test(input.sourceManifestSha256), 'OWNER_BINDING_INVALID');
  unique(input.targetUsers.map(user => { require(uid(user.localId), 'TARGET_USER_INVALID'); return user.localId; }), 'TARGET_USER_COLLISION');
  const providers = input.targetUsers.flatMap(user => (importableUser(user).providerUserInfo ?? [])
    .map((provider: Fields) => `${provider.providerId}:${provider.rawId}`));
  unique(providers, 'TARGET_PROVIDER_COLLISION');
  const sourceOwner = source.users.find(user => user.localId === owner);
  const sourceGoogle = sourceOwner && importableUser(sourceOwner).providerUserInfo?.find((p: Fields) => p.providerId === 'google.com');
  const targetOwner = input.targetUsers.find(user => user.localId === owner);
  const targetGoogle = targetOwner && importableUser(targetOwner).providerUserInfo?.find((p: Fields) => p.providerId === 'google.com');
  require(sourceGoogle && targetGoogle && sourceGoogle.rawId === targetGoogle.rawId && !targetOwner?.disabled, 'GOOGLE_OWNER_REQUIRED');
  const guests = new Set(source.users.filter(user => !(importableUser(user).providerUserInfo?.length)).map(user => user.localId));
  require(source.users.every(user => user.localId === owner || guests.has(user.localId)), 'UNRELATED_SOURCE_ACCOUNT');
  require(input.targetUsers.every(user => !guests.has(user.localId)), 'LEGACY_ACCOUNT_ALREADY_IMPORTED');
  const target = ensureDocumentMap(input.targetDocuments);
  const receiptId = sha256(canonicalJson({ version: 1, sourceManifestSha256: input.sourceManifestSha256, targetProject: settings.targetProjectId, owner }));
  const receiptPath = `firebaseOwnershipMigrations/${receiptId}`;
  require(!target.has(receiptPath), 'CONSOLIDATION_ALREADY_APPLIED');
  const sourcePrefix = `projects/${settings.sourceProjectId}/databases/${settings.sourceDatabaseId}/documents/`;
  const targetPrefix = `projects/${settings.targetProjectId}/databases/${settings.targetDatabaseId}/documents/`;
  const destinationPath = (name: string): string => {
    const parts = name.split('/');
    require(parts.length % 2 === 0 && parts.every(part => part && part !== '.' && part !== '..'), 'SOURCE_PATH_INVALID');
    if (parts[0] === 'users' || indexRoots.has(parts[0])) {
      require(parts[1] === owner || guests.has(parts[1]), 'UNRECOGNIZED_SOURCE_OWNER');
      parts[1] = owner;
    }
    return parts.join('/');
  };
  const references = (value: any): any => {
    if (value.referenceValue) {
      require(value.referenceValue.startsWith(sourcePrefix), 'EXTERNAL_REFERENCE_UNSUPPORTED');
      return { referenceValue: targetPrefix + destinationPath(value.referenceValue.slice(sourcePrefix.length)) };
    }
    if (value.mapValue) return { mapValue: { fields: Object.fromEntries(Object.entries(map(value)).map(([k, v]) => [k, references(v)])) } };
    if (value.arrayValue) return { arrayValue: { values: (value.arrayValue.values ?? []).map(references) } };
    return structuredClone(value);
  };
  const changes = new Map<string, Change>();
  const mappings: { source: string; target: string; sourceHash: string; sourceOwner: string }[] = [];
  const indexSources = new Map<string, WorkspaceDocument[]>();
  const ownersWithData = new Set<string>();
  const migratedProjects: string[] = [];
  for (const doc of source.documents) {
    const parts = doc.path.split('/');
    require(parts[0] === 'users' || indexRoots.has(parts[0]) || ['rooms', 'homeRooms'].includes(parts[0]), 'SOURCE_COLLECTION_UNSUPPORTED');
    const originalOwner = parts[0] === 'users' || indexRoots.has(parts[0]) ? parts[1] : string(doc.fields.ownerId);
    require(originalOwner === owner || guests.has(originalOwner), 'UNRECOGNIZED_SOURCE_OWNER');
    if (originalOwner === owner) { require(target.has(doc.path), 'EXISTING_GOOGLE_DATA_MISSING'); continue; }
    ownersWithData.add(originalOwner);
    const name = destinationPath(doc.path);
    mappings.push({ source: doc.path, target: name, sourceHash: documentHash(doc), sourceOwner: originalOwner });
    if (indexRoots.has(parts[0])) {
      require(parts.length === 2, 'INDEX_PATH_UNSUPPORTED');
      indexSources.set(parts[0], [...(indexSources.get(parts[0]) ?? []), doc]); continue;
    }
    require(!target.has(name) && !changes.has(name), 'DESTINATION_DOCUMENT_COLLISION');
    if (parts[0] === 'users') require(parts.length === 4 && ['homes', 'projects'].includes(parts[2])
      || parts.length === 6 && parts[2] === 'homes' && ['revisions', 'summaries', 'agreementProse'].includes(parts[4]), 'USER_PATH_UNSUPPORTED');
    else require(parts.length === 2, 'ROOT_PATH_UNSUPPORTED');
    const fields = references({ mapValue: { fields: remapFirestoreFields(doc.fields, '\0', '\0') } }).mapValue.fields;
    if (parts.length === 4 || parts[0] === 'rooms' || parts[0] === 'homeRooms') {
      require(string(fields.ownerId) === originalOwner, 'SOURCE_OWNER_MISMATCH'); fields.ownerId = typed(owner);
    }
    if (parts[0] === 'rooms') {
      require(!fields.run && !fields.delivery && !['queued', 'thinking'].includes(string(map(fields.observer).status)), 'SOURCE_WORK_UNFINISHED');
      require(fields.clientId?.stringValue !== owner, 'ROOM_IDENTITY_COLLAPSE');
      fields.paused = typed(true); fields.nextRunAt = typed(0); map(fields.observer).status = typed('paused');
      require(uuid(string(fields.projectId)), 'ROOM_PROJECT_INVALID'); migratedProjects.push(string(fields.projectId));
    }
    if (parts[2] === 'projects') require(!fields.analysisAttempt, 'SOURCE_WORK_UNFINISHED');
    if (parts[2] === 'homes' && parts.length === 4) for (const value of Object.values(map(fields.jobs))) require(!['running', 'save_pending'].includes(string(map(value).status)), 'SOURCE_WORK_UNFINISHED');
    changes.set(name, { path: name, fields, beforeHash: null });
  }
  require(mappings.length > 0, 'NO_GUEST_DATA');
  for (const [root, sources] of indexSources) {
    const name = `${root}/${owner}`, previous = target.get(name);
    const empty = root === 'homeOwners' ? { homeIds: [], creations: {}, callsUsed: 0 } : root === 'roomOwners' ? { projects: {} }
      : root === 'homeRoomOwners' ? { homes: {} } : { profiles: {}, receipts: {} };
    const fields = structuredClone(previous?.fields ?? typed(empty).mapValue.fields);
    for (const doc of sources) {
      const f = structuredClone(doc.fields);
      if (root === 'homeOwners') {
        keys(f, ['homeIds', 'creations', 'callsUsed', 'active']); require(!f.active, 'SOURCE_WORK_UNFINISHED');
        fields.homeIds = typed(unique([...strings(fields.homeIds), ...strings(f.homeIds)], 'HOME_ID_COLLISION'));
        mergeMaps(map(fields.creations), map(f.creations)); fields.callsUsed = typed(number(fields.callsUsed) + number(f.callsUsed));
      } else if (root === 'roomOwners') {
        keys(f, ['projects', 'active']); require(!f.active, 'SOURCE_WORK_UNFINISHED'); mergeMaps(map(fields.projects), map(f.projects));
      } else if (root === 'homeRoomOwners') { keys(f, ['homes']); mergeMaps(map(fields.homes), map(f.homes)); }
      else {
        keys(f, ['profiles', 'receipts']);
        for (const profile of Object.values(map(f.profiles))) { const p = map(profile); require(string(p.ownerId) === doc.path.split('/')[1], 'ASSISTANT_OWNER_MISMATCH'); p.ownerId = typed(owner); }
        mergeMaps(map(fields.profiles), map(f.profiles)); mergeMaps(map(fields.receipts), map(f.receipts));
      }
    }
    if (root === 'roomOwners') {
      const imported = unique([...(fields.migratedProjectIds ? strings(fields.migratedProjectIds) : []), ...migratedProjects], 'MIGRATED_PROJECT_COLLISION');
      require(imported.length <= 100 && imported.every(id => uuid(id) && Object.hasOwn(map(fields.projects), id)), 'MIGRATED_PROJECT_INVALID');
      fields.migratedProjectIds = typed(imported.sort());
    }
    if (previous) require(typeof previous.updateTime === 'string', 'TARGET_VERSION_REQUIRED');
    changes.set(name, { path: name, fields, beforeHash: previous ? documentHash(previous) : null, ...(previous ? { updateTime: previous.updateTime } : {}) });
  }
  const final = new Map(target);
  for (const change of changes.values()) final.set(change.path, change);
  const counts = validateWorkspaceGraph([...final.values()], owner);
  const body = { schemaVersion: 1, kind: 'guest-data-consolidation', sourceProjectId: settings.sourceProjectId, targetProjectId: settings.targetProjectId,
    targetUid: owner, sourceManifestSha256: input.sourceManifestSha256, mappings: mappings.sort((a, b) => a.source.localeCompare(b.source)),
    changes: [...changes.values()].sort((a, b) => a.path.localeCompare(b.path)), counts: { ...counts, sourceDocuments: mappings.length, sourceGuestOwners: ownersWithData.size,
      anonymousAccountsImported: 0, createdDocuments: [...changes.values()].filter(x => x.beforeHash === null).length, updatedIndexes: [...changes.values()].filter(x => x.beforeHash !== null).length } };
  const planSha256 = sha256(canonicalJson(body));
  const receipt: Change = { path: receiptPath, fields: typed({ schemaVersion: 1, kind: body.kind, sourceProjectId: settings.sourceProjectId, targetProjectId: settings.targetProjectId,
    targetUid: owner, sourceManifestSha256: input.sourceManifestSha256, planSha256, mappings: body.mappings, counts: body.counts }).mapValue.fields, beforeHash: null };
  const writes = [...body.changes, receipt].map(change => ({ update: { name: targetPrefix + change.path, fields: change.fields },
    currentDocument: change.beforeHash === null ? { exists: false } : { updateTime: change.updateTime } }));
  require(writes.length <= 500 && Buffer.byteLength(JSON.stringify({ writes })) < 9_000_000, 'ATOMIC_COMMIT_LIMIT');
  return { ...body, planSha256, receipt, writes };
}
