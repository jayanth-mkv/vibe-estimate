import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const metadataKeys = [
  'backend_project_id', 'firebase_project_id', 'project_number', 'region',
  'firestore_database_id', 'gemini_model', 'runtime_service_account', 'task_queue',
  'task_service_account', 'firebase_web_config_secret', 'firebase_web_config_version',
].sort();
const requireValue = (condition) => { if (!condition) throw new Error('Release input or verification boundary failed.'); };
const projectId = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export function releaseInputs(env) {
  requireValue(env.BRANCH_NAME === 'main' && /^[a-f0-9]{40}$/.test(env.COMMIT_SHA ?? ''));
  const encoded = env.RELEASE_RUNTIME_VARS_B64 ?? '';
  requireValue(encoded.length > 0 && encoded.length <= 16384 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded));
  const bytes = Buffer.from(encoded, 'base64');
  requireValue(bytes.toString('base64') === encoded);
  const metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  requireValue(metadata && !Array.isArray(metadata) && Object.keys(metadata).sort().join(',') === metadataKeys.join(','));
  requireValue(Object.values(metadata).every(value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\r\n\0]/.test(value)));
  requireValue([metadata.backend_project_id, metadata.firebase_project_id].every(value => projectId.test(value) && !value.startsWith('demo-')));
  requireValue(/^[1-9][0-9]{5,19}$/.test(metadata.project_number) && /^[a-z]+-[a-z]+[0-9]$/.test(metadata.region));
  requireValue(metadata.firestore_database_id === '(default)' || /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(metadata.firestore_database_id));
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._-]+$/.test(metadata.gemini_model));
  const identity = new RegExp('^[a-z][a-z0-9-]+@' + metadata.backend_project_id + '[.]iam[.]gserviceaccount[.]com$');
  requireValue(identity.test(metadata.runtime_service_account) && identity.test(metadata.task_service_account));
  requireValue(metadata.task_queue.startsWith(`projects/${metadata.backend_project_id}/locations/${metadata.region}/queues/`) && /^[A-Za-z0-9_-]+$/.test(metadata.task_queue.split('/').at(-1)) && metadata.task_queue.split('/').length === 6);
  requireValue(/^[A-Za-z0-9_-]+$/.test(metadata.firebase_web_config_secret) && /^[1-9][0-9]*$/.test(metadata.firebase_web_config_version));
  const repository = env.RELEASE_IMAGE_REPOSITORY ?? '';
  requireValue(repository.startsWith(`${metadata.region}-docker.pkg.dev/${metadata.backend_project_id}/`) && /^[a-z0-9.-]+-docker\.pkg\.dev\/[a-z0-9-]+\/[a-z0-9._-]+\/[a-z0-9._/-]+$/.test(repository) && !repository.includes('..') && !repository.includes('//') && !repository.endsWith('/'));
  requireValue(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.RELEASE_STATE_BUCKET ?? ''));
  const githubRepository = env.RELEASE_GITHUB_REPOSITORY ?? '';
  requireValue(githubRepository === '' || /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(githubRepository));
  return { metadata, repository, githubRepository, commit: env.COMMIT_SHA };
}

export function runtimeVariables(inputs, digest) {
  requireValue(/^sha256:[a-f0-9]{64}$/.test(digest));
  return { ...inputs.metadata, image: `${inputs.repository}@${digest}` };
}

export function verifyPlan(plan, variables) {
  requireValue(plan && plan.errored !== true && plan.complete !== false && !(plan.deferred_changes?.length));
  const changes = plan.resource_changes;
  requireValue(Array.isArray(changes) && changes.length === 1);
  const resource = changes[0];
  requireValue(resource.address === 'google_cloud_run_v2_service.application' && resource.mode === 'managed' && resource.type === 'google_cloud_run_v2_service');
  const { before, after, actions } = resource.change ?? {};
  requireValue(Array.isArray(actions) && actions.length === 1 && ['no-op', 'update'].includes(actions[0]));
  const id = `projects/${variables.backend_project_id}/locations/${variables.region}/services/vibeestimate`;
  requireValue(before?.id === id && after?.id === id && before.name === 'vibeestimate' && after.name === 'vibeestimate');
  requireValue(after.project === variables.backend_project_id && after.location === variables.region && after.deletion_protection === true);
  requireValue(after.template?.[0]?.containers?.[0]?.image === variables.image);
  return { serviceOnly: true, destructiveChanges: false, changed: actions[0] === 'update' };
}

export function verifyHealth(body, expectedCommit) {
  requireValue(body?.status === 'ok' && body.runtime === 'production' && body.auth === 'firebase' && body.storage === 'firestore' && body.storageConnection === 'cloud' && body.aiProvider === 'gemini' && body.geminiTransport === 'vertex');
  if (expectedCommit !== undefined) requireValue(/^[a-f0-9]{40}$/.test(expectedCommit) && body.gitRevision === expectedCommit);
  return { productionHealth: true, firebase: true, firestore: true, vertex: true };
}

async function main(action) {
  const inputs = releaseInputs(process.env);
  const artifact = filename => path.resolve('.cache/release', filename);
  const read = filename => JSON.parse(fs.readFileSync(artifact(filename), 'utf8'));
  const write = (filename, value) => {
    fs.mkdirSync(path.dirname(artifact(filename)), { recursive: true });
    fs.writeFileSync(artifact(filename), JSON.stringify(value), { mode: 0o600 });
  };
  if (action === 'guard') {
    fs.mkdirSync(path.dirname(artifact('runtime.tfvars.json')), { recursive: true });
    console.log(JSON.stringify({ mainBranch: true, fullCommit: true, metadataOnly: true }));
  } else if (action === 'variables') {
    write('runtime.tfvars.json', runtimeVariables(inputs, fs.readFileSync(artifact('image-digest.txt'), 'utf8').trim()));
  } else if (action === 'plan') {
    const result = verifyPlan(read('runtime-plan.json'), read('runtime.tfvars.json'));
    if (inputs.githubRepository) {
      const response = await fetch(`https://api.github.com/repos/${inputs.githubRepository}/commits/main`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'VibeEstimate-native-release' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      requireValue(response.ok);
      const latest = await response.json();
      requireValue(/^[a-f0-9]{40}$/.test(latest.sha ?? ''));
      if (latest.sha !== inputs.commit) {
        write('skip.json', { staleCommit: true });
        console.log(JSON.stringify({ staleCommit: true, deployed: false }));
        return;
      }
    }
    write('plan-verified.json', result);
    console.log(JSON.stringify(result));
  } else if (action === 'health') {
    if (fs.existsSync(artifact('skip.json'))) return;
    requireValue(fs.existsSync(artifact('plan-verified.json')));
    const origin = `https://vibeestimate-${inputs.metadata.project_number}.${inputs.metadata.region}.run.app`;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${origin}/health`, { redirect: 'error', signal: AbortSignal.timeout(Math.min(10000, deadline - Date.now())) });
        requireValue(response.ok);
        const result = verifyHealth(await response.json(), inputs.commit);
        write('verification.json', { ...result, commit: inputs.commit, checkedAt: new Date().toISOString() });
        console.log(JSON.stringify(result));
        return;
      } catch { /* Bounded startup wait; no raw response or credential logging. */ }
      if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(5000, deadline - Date.now())));
    }
    throw new Error('Production health did not become ready.');
  } else throw new Error('Unsupported native-build verification step.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(() => {
    console.error('Native release verification failed; credentials and raw cloud responses were not logged.');
    process.exitCode = 1;
  });
}
