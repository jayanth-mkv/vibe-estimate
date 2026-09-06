import path from 'node:path';
import { isExternalEvidencePath } from './production-verification-env.mjs';

const invalid = () => new Error('V1 production rehearsal requires an explicitly authorized HTTPS target, exact Git revision and external private evidence; configuration values are withheld.');
export function v1ProductionArguments(args) {
  const result = { list: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--list' && !result.list) { result.list = true; continue; }
    const key = flag === '--target' ? 'target' : flag === '--expected-git-sha' ? 'expectedGitRevision' : undefined;
    if (!key || result[key] || !args[index + 1] || args[index + 1].startsWith('--')) throw invalid();
    result[key] = args[++index];
  }
  if (!result.target || !/^[a-f0-9]{40}$/.test(result.expectedGitRevision ?? '')) throw invalid();
  try { const url = new URL(result.target); if (url.protocol !== 'https:' || url.origin !== result.target || url.username || url.password) throw invalid(); }
  catch { throw invalid(); }
  return result;
}

export function v1ProductionTarget(options, operator, discovery, outputs, repository, privateDirectory) {
  if (!operator || !discovery || !outputs || typeof operator.firebaseProjectId !== 'string' || operator.firebaseProjectId.startsWith('demo-')
    || discovery.backendProjectId !== operator.backendProjectId
    || options.target !== outputs.public_url?.value
    || options.target !== `https://vibeestimate-${discovery.projectNumber}.${operator.backendRegion}.run.app`
    || !isExternalEvidencePath(repository, privateDirectory, path)) throw invalid();
  return { origin: options.target, expectedGitRevision: options.expectedGitRevision, firebaseProjectId: operator.firebaseProjectId, runtime: 'production', explicitJobBudget: 3, providerAttemptBudget: 6 };
}

export function v1ProductionHealth(health, expectedGitRevision) {
  return health?.status === 'ok' && health.runtime === 'production' && health.aiProvider === 'gemini'
    && health.auth === 'firebase' && health.storage === 'firestore' && health.storageConnection === 'cloud'
    && health.gitRevision === expectedGitRevision;
}
