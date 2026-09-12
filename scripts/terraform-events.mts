import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

type RecordValue = Record<string, any>;
type EventSettings = {
  backendProjectId: string; firebaseProjectId: string; firestoreDatabaseId: string;
  firebaseLocation: string; region: string; projectNumber: string;
  gcloudConfiguration: string; account: string;
};
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const plain = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const settingsKeys = ['backendProjectId', 'firebaseProjectId', 'firestoreDatabaseId', 'firebaseLocation', 'region', 'projectNumber', 'gcloudConfiguration', 'account'];
const requiredApis = ['eventarc.googleapis.com', 'eventarcpublishing.googleapis.com', 'workflows.googleapis.com', 'workflowexecutions.googleapis.com', 'pubsub.googleapis.com'];

class EventBillingPreflightError extends Error {
  constructor(reason: 'disabled' | 'mismatch' | 'unavailable') {
    super({
      disabled: 'Event apply stopped: billing is not enabled on the configured Firebase source project. No Terraform changes were started.',
      mismatch: 'Event apply stopped: the billing response did not match the configured Firebase source project. No Terraform changes were started.',
      unavailable: 'Event apply stopped: source-project billing could not be verified. No Terraform changes were started.',
    }[reason]);
    this.name = 'EventBillingPreflightError';
  }
}

/** Read-only preflight: do not partially activate paid source services. */
export async function checkEventApplyBilling(action: string, settings: EventSettings, token: string, request: typeof fetch = fetch): Promise<void> {
  if (action !== 'apply') return;
  let info: unknown;
  try {
    const response = await request(`https://cloudbilling.googleapis.com/v1/projects/${settings.firebaseProjectId}/billingInfo?fields=projectId,billingEnabled`, {
      method: 'GET',
      // Cloud Billing's global API must not inherit a quota-project override:
      // that would require activating the API on an otherwise unrelated quota
      // project. The resource path and response bind the explicit source target.
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Billing read failed');
    info = await response.json();
  } catch {
    // Never surface response bodies, account IDs, tokens or network diagnostics.
    throw new EventBillingPreflightError('unavailable');
  }
  if (!plain(info) || info.projectId !== settings.firebaseProjectId) throw new EventBillingPreflightError('mismatch');
  if (info.billingEnabled !== true) throw new EventBillingPreflightError('disabled');
}

/** Private discovery is explicit and checked against the existing operator files. */
export function validateEventSettings(value: unknown, operator: RecordValue, vertex: RecordValue, connected: RecordValue, discovery: RecordValue): EventSettings {
  if (!plain(value) || Object.keys(value).length !== settingsKeys.length || settingsKeys.some(key => typeof value[key] !== 'string')) throw new Error('Incomplete private event configuration');
  const settings = value as EventSettings;
  const project = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
  if (![settings.backendProjectId, settings.firebaseProjectId].every(id => project.test(id) && !id.startsWith('demo-'))
    || !/^[1-9][0-9]{5,19}$/.test(settings.projectNumber)
    || !/^[a-z]+-[a-z]+[0-9]$/.test(settings.region)
    || !/^([a-z]+-[a-z]+[0-9]|nam[0-9]|eur[0-9])$/.test(settings.firebaseLocation)
    || !(settings.firestoreDatabaseId === '(default)' || /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(settings.firestoreDatabaseId))
    || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(settings.gcloudConfiguration)
    || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(settings.account)
    || /\.gserviceaccount\.com$/i.test(settings.account)) throw new Error('Invalid private event target');
  if (settings.backendProjectId !== operator.backendProjectId || settings.backendProjectId !== vertex.projectId
    || settings.backendProjectId !== discovery.backendProjectId || settings.firebaseProjectId !== operator.firebaseProjectId
    || settings.firebaseProjectId !== connected.firebaseProjectId || settings.firestoreDatabaseId !== connected.firestoreDatabaseId
    || settings.region !== operator.backendRegion || settings.region !== discovery.region
    || settings.projectNumber !== String(discovery.projectNumber)
    || settings.account !== operator.account || settings.account !== vertex.account || settings.account !== connected.account
    || settings.gcloudConfiguration !== operator.gcloudConfiguration || settings.gcloudConfiguration !== vertex.gcloudConfiguration
    || settings.gcloudConfiguration !== connected.gcloudConfiguration) throw new Error('Authorized event target mismatch');
  return settings;
}

/** This launcher adopts or creates only the narrow event-delivery resources. */
export function allowedEventResources(settings: EventSettings): Map<string, { type: string; project: string; importId: string }> {
  const source = settings.firebaseProjectId;
  const workflow = `projects/${source}/locations/${settings.region}/workflows/vibeestimate-review-dispatch`;
  return new Map([
    ...requiredApis.map(api => [`google_project_service.required[${JSON.stringify(api)}]`, { type: 'google_project_service', project: source, importId: `${source}/${api}` }] as const),
    ['google_service_account.workflow', { type: 'google_service_account', project: source, importId: `projects/${source}/serviceAccounts/vibeestimate-events@${source}.iam.gserviceaccount.com` }],
    ['google_service_account.trigger', { type: 'google_service_account', project: source, importId: `projects/${source}/serviceAccounts/vibeestimate-event-trigger@${source}.iam.gserviceaccount.com` }],
    ['google_project_iam_member.event_receiver', { type: 'google_project_iam_member', project: source, importId: `${source} roles/eventarc.eventReceiver serviceAccount:vibeestimate-event-trigger@${source}.iam.gserviceaccount.com` }],
    ['google_cloud_run_v2_service_iam_member.dispatcher', { type: 'google_cloud_run_v2_service_iam_member', project: settings.backendProjectId, importId: `projects/${settings.backendProjectId}/locations/${settings.region}/services/vibeestimate roles/run.invoker serviceAccount:vibeestimate-events@${source}.iam.gserviceaccount.com` }],
    ['google_workflows_workflow.dispatch', { type: 'google_workflows_workflow', project: source, importId: workflow }],
    ['google_project_iam_member.workflow_invoker', { type: 'google_project_iam_member', project: source, importId: `${source} roles/workflows.invoker serviceAccount:vibeestimate-event-trigger@${source}.iam.gserviceaccount.com` }],
    ['google_eventarc_trigger.outbox_created', { type: 'google_eventarc_trigger', project: source, importId: `projects/${source}/locations/${settings.firebaseLocation}/triggers/vibeestimate-review-outbox` }],
  ]);
}

export function inspectEventPlan(plan: unknown, settings: EventSettings): { resource: string; actions: string[] }[] {
  if (!plain(plan) || plan.errored || !Array.isArray(plan.resource_changes)) throw new Error('Invalid event plan');
  const allowed = allowedEventResources(settings);
  const changes: { resource: string; actions: string[] }[] = [];
  for (const item of plan.resource_changes) {
    const expected = allowed.get(item.address);
    if (!expected || item.mode !== 'managed' || item.type !== expected.type || item.change.importing
      || !Array.isArray(item.change.actions) || !['no-op', 'create'].includes(item.change.actions.join(','))) throw new Error('Non-additive or unexpected event plan rejected');
    const after = item.change.after;
    if (!plain(after) || after.project !== expected.project) throw new Error('Event plan project mismatch');
    // API import leaves this Terraform-only lifecycle flag null in provider
    // state, even with false in configuration. A no-op cannot disable the API;
    // all additions must still explicitly preserve it on destroy.
    const importedApiNoop = item.change.actions[0] === 'no-op' && after.disable_on_destroy == null;
    if (item.type === 'google_project_service' && (!requiredApis.includes(after.service) || (after.disable_on_destroy !== false && !importedApiNoop))) throw new Error('Unexpected API change');
    if (item.type === 'google_service_account' && after.account_id !== (item.address.endsWith('.workflow') ? 'vibeestimate-events' : 'vibeestimate-event-trigger')) throw new Error('Unexpected event identity');
    if (item.address === 'google_project_iam_member.event_receiver' && (after.role !== 'roles/eventarc.eventReceiver' || after.member !== `serviceAccount:vibeestimate-event-trigger@${settings.firebaseProjectId}.iam.gserviceaccount.com`)) throw new Error('Unexpected event permission');
    if (item.type === 'google_cloud_run_v2_service_iam_member' && (after.name !== 'vibeestimate' || after.location !== settings.region || after.role !== 'roles/run.invoker' || after.member !== `serviceAccount:vibeestimate-events@${settings.firebaseProjectId}.iam.gserviceaccount.com`)) throw new Error('Unexpected Cloud Run permission');
    if (item.type === 'google_workflows_workflow' && (after.name !== 'vibeestimate-review-dispatch' || after.region !== settings.region || after.service_account !== `projects/${settings.firebaseProjectId}/serviceAccounts/vibeestimate-events@${settings.firebaseProjectId}.iam.gserviceaccount.com` || after.call_log_level !== 'LOG_ERRORS_ONLY' || after.deletion_protection !== true || after.user_env_vars?.DISPATCH_ORIGIN !== `https://vibeestimate-${settings.projectNumber}.${settings.region}.run.app`)) throw new Error('Unexpected workflow target');
    if (item.address === 'google_project_iam_member.workflow_invoker' && (after.role !== 'roles/workflows.invoker' || after.member !== `serviceAccount:vibeestimate-event-trigger@${settings.firebaseProjectId}.iam.gserviceaccount.com`)) throw new Error('Unexpected workflow permission');
    if (item.type === 'google_eventarc_trigger') {
      const filters = after.matching_criteria;
      if (after.name !== 'vibeestimate-review-outbox' || after.location !== settings.firebaseLocation || after.service_account !== `vibeestimate-event-trigger@${settings.firebaseProjectId}.iam.gserviceaccount.com` || after.event_data_content_type !== 'application/protobuf'
        || !Array.isArray(filters) || filters.length !== 3
        || !filters.some((f: RecordValue) => f.attribute === 'type' && f.value === 'google.cloud.firestore.document.v1.created')
        || !filters.some((f: RecordValue) => f.attribute === 'database' && f.value === settings.firestoreDatabaseId)
        || !filters.some((f: RecordValue) => f.attribute === 'document' && f.value === 'roomReviewOutbox/{jobId}' && f.operator === 'match-path-pattern')) throw new Error('Unexpected event source');
    }
    if (item.change.actions[0] !== 'no-op') changes.push({ resource: item.address, actions: item.change.actions });
  }
  return changes;
}

function rejectLinkedPath(filename: string): string {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const segment of path.relative(current, absolute).split(path.sep)) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked private path rejected'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
  }
  return absolute;
}

async function main() {
  const [action, importAddress, ...extra] = process.argv.slice(2);
  if (!['init', 'validate', 'fmt', 'plan', 'apply', 'outputs', 'import'].includes(action) || extra.length
    || (action === 'import' ? !importAddress : action === 'plan' ? !!importAddress && importAddress !== '--bootstrap' : !!importAddress)) throw new Error('Unsupported event operation');
  const scope = action === 'plan' && importAddress === '--bootstrap' ? 'bootstrap' : 'full';
  const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (fs.realpathSync(process.cwd()) !== root) throw new Error('Run from this repository root');
  const privateRoot = fs.realpathSync(rejectLinkedPath(path.resolve(root, '../docs/private')));
  if (!path.relative(root, privateRoot).startsWith('..' + path.sep)) throw new Error('Private configuration must stay outside the repository');
  const privateFile = (relative: string) => {
    const filename = rejectLinkedPath(path.resolve(privateRoot, relative));
    const distance = path.relative(privateRoot, filename);
    if (!distance || distance.startsWith('..' + path.sep) || distance === '..' || path.isAbsolute(distance)) throw new Error('Private path escaped');
    return filename;
  };
  const read = (name: string) => {
    const file = privateFile(name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('Invalid private metadata file');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!plain(value)) throw new Error('Invalid private metadata');
    return value;
  };
  const operator = read('local-config.json');
  const vertex = read('vertex-local.json');
  const connected = read('firebase-connected.json');
  const settings = validateEventSettings(read('event-delivery.json'), operator, vertex, connected, read('production-discovery.json'));
  if (typeof vertex.gcloudConfigDir !== 'string' || typeof connected.gcloudConfigDir !== 'string'
    || fs.realpathSync(rejectLinkedPath(vertex.gcloudConfigDir)) !== fs.realpathSync(rejectLinkedPath(connected.gcloudConfigDir))) throw new Error('Profile configuration directory mismatch');
  const stateBucket = read('delivery-outputs.json').state_bucket?.value;
  if (typeof stateBucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(stateBucket)) throw new Error('Invalid private state bucket');
  const adcFile = rejectLinkedPath(path.join(vertex.gcloudConfigDir, 'application_default_credentials.json'));
  const adcHash = () => fs.existsSync(adcFile) ? digest(fs.readFileSync(adcFile)) : 'absent';
  const before = adcHash();
  const infra = path.join(root, 'infra/events');
  const stateDir = privateFile('events-terraform');
  fs.mkdirSync(stateDir, { recursive: true });
  const toolsDir = rejectLinkedPath(path.join(root, 'infra/.tools'));
  const cache = rejectLinkedPath(path.join(toolsDir, 'events-provider-cache'));
  const dataDir = rejectLinkedPath(path.join(toolsDir, 'events-data'));
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const tfConfig = rejectLinkedPath(path.join(toolsDir, 'events.rc'));
  fs.writeFileSync(tfConfig, 'disable_checkpoint = true\n');
  const outputFile = (name: string) => privateFile(path.join('events-terraform', name));
  const vars = {
    backend_project_id: settings.backendProjectId, firebase_project_id: settings.firebaseProjectId,
    project_number: settings.projectNumber, region: settings.region,
    firestore_database_id: settings.firestoreDatabaseId, firebase_location: settings.firebaseLocation,
  };
  const varsText = JSON.stringify(vars);
  const varsFile = outputFile('events.tfvars.json');
  fs.writeFileSync(varsFile, varsText);
  const sourceHash = () => digest(fs.readdirSync(infra).filter(name => /\.(tf|yaml)$/.test(name) || name === '.terraform.lock.hcl').sort()
    .map(name => `${name}\n${fs.readFileSync(path.join(infra, name), 'utf8')}`).join('\n') + '\n' + fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'));
  const inputsHash = digest(JSON.stringify({ settings, stateBucket, gcloudConfigDir: vertex.gcloudConfigDir }));
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TF_|GOOGLE_|GCLOUD_|CLOUDSDK_|GEMINI_|VERTEX_|FIREBASE_|FIRESTORE_|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|HTTPS?_PROXY|ALL_PROXY)/i.test(key)));
  Object.assign(env, { TF_CLI_CONFIG_FILE: tfConfig, TF_PLUGIN_CACHE_DIR: cache, TF_DATA_DIR: dataDir, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1' });
  const binary = path.join(toolsDir, 'terraform-1.13.5', process.platform === 'win32' ? 'terraform.exe' : 'terraform');
  const run = (args: string[]) => new Promise<{ code: number; output: string }>((resolve, reject) => {
    let output = '';
    const child = spawn(binary, args, { cwd: infra, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', () => reject(new Error('Terraform could not start')));
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
  const planFile = outputFile('events.tfplan');
  const manifestFile = outputFile('plan-manifest.json');
  let token = '';
  try {
    if (['init', 'plan', 'apply', 'outputs', 'import'].includes(action)) {
      const { obtainNamedProfileToken } = await import('../backend/dist/vertex-auth.js');
      token = await obtainNamedProfileToken({ projectId: settings.backendProjectId, gcloudConfiguration: settings.gcloudConfiguration, gcloudAccount: settings.account, gcloudConfigDir: vertex.gcloudConfigDir });
      Object.assign(env, { TF_VAR_access_token: token, GOOGLE_OAUTH_ACCESS_TOKEN: token });
    } else env.TF_VAR_access_token = 'unused-offline-validation-token';
    await checkEventApplyBilling(action, settings, token);
    const startingSourceHash = sourceHash();
    let args: string[];
    if (action === 'init') args = ['init', '-input=false', '-no-color', '-backend-config=bucket=' + stateBucket, '-backend-config=prefix=events'];
    else if (action === 'validate') args = ['validate', '-json'];
    else if (action === 'fmt') args = ['fmt', '-no-color'];
    else if (action === 'plan') args = ['plan', '-input=false', '-no-color', '-var-file=' + varsFile, '-out=' + planFile, ...(scope === 'bootstrap' ? ['-target=google_project_service.required'] : [])];
    else if (action === 'outputs') args = ['output', '-json'];
    else if (action === 'import') {
      const address = requiredApis.includes(importAddress) ? `google_project_service.required[${JSON.stringify(importAddress)}]` : importAddress;
      const expected = allowedEventResources(settings).get(address);
      if (!expected) throw new Error('Unapproved resource import');
      args = ['import', '-input=false', '-no-color', '-var-file=' + varsFile, address, expected.importId];
    } else {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (manifest.planHash !== digest(fs.readFileSync(planFile)) || manifest.sourceHash !== startingSourceHash
        || manifest.varsHash !== digest(varsText) || manifest.inputsHash !== inputsHash || !['bootstrap', 'full'].includes(manifest.scope)) throw new Error('Saved plan no longer matches verified inputs');
      // Re-inspect the saved binary plan, not a replaceable JSON sidecar.
      const reviewed = await run(['show', '-json', planFile]);
      if (reviewed.code !== 0) throw new Error('Saved plan inspection failed');
      const reviewedChanges = inspectEventPlan(JSON.parse(reviewed.output), settings);
      if (manifest.scope === 'bootstrap' && reviewedChanges.some(item => !item.resource.startsWith('google_project_service.required['))) throw new Error('Bootstrap plan includes non-API resources');
      args = ['apply', '-input=false', '-no-color', planFile];
    }
    const result = await run(args);
    const safeOutput = token ? result.output.split(token).join('[REDACTED]') : result.output;
    fs.writeFileSync(outputFile(action + '.log'), safeOutput);
    if (result.code !== 0) {
      console.log(JSON.stringify({ action, ok: false, diagnostics: safeOutput.split('\n').filter(line => line.startsWith('Error:')).map(line => line.slice(0, 180)) }));
      process.exitCode = 1;
      return;
    }
    if (action === 'plan') {
      const shown = await run(['show', '-json', planFile]);
      if (shown.code !== 0 || (token && shown.output.includes(token))) throw new Error('Plan inspection failed');
      const changes = inspectEventPlan(JSON.parse(shown.output), settings);
      if (scope === 'bootstrap' && changes.some(item => !item.resource.startsWith('google_project_service.required['))) throw new Error('Bootstrap plan includes non-API resources');
      if (sourceHash() !== startingSourceHash) throw new Error('Event source changed while planning');
      fs.writeFileSync(outputFile('plan.json'), shown.output);
      fs.writeFileSync(manifestFile, JSON.stringify({ planHash: digest(fs.readFileSync(planFile)), sourceHash: startingSourceHash, varsHash: digest(varsText), inputsHash, scope }));
      console.log(JSON.stringify({ action, scope, ok: true, changes }));
    } else if (action === 'outputs') {
      if (token && result.output.includes(token)) throw new Error('Unexpected credential in outputs');
      fs.writeFileSync(privateFile('events-outputs.json'), result.output);
      console.log(JSON.stringify({ action, ok: true, storedPrivately: true }));
    } else console.log(JSON.stringify({ action, ok: true }));
  } finally {
    token = '';
    delete env.TF_VAR_access_token;
    delete env.GOOGLE_OAUTH_ACCESS_TOKEN;
    const unchanged = before === adcHash();
    console.log(JSON.stringify({ sharedAdcUnchanged: unchanged }));
    if (!unchanged) process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error instanceof EventBillingPreflightError ? error.message : 'Event Terraform operation stopped; private values and raw errors omitted.'); process.exitCode = 1; });
}
