import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { productionVerificationEnvironment } from './production-verification-env.mjs';
import { v1ProductionArguments, v1ProductionTarget, v1ProductionHealth } from './v1-production-target.mjs';

// This entry is separate from deterministic verification and never runs on merge.
// Invocation requires both the operator's private target record and an exact SHA.
const repository = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const options = v1ProductionArguments(process.argv.slice(2));
const privateRoot = fs.realpathSync(path.resolve(repository, '../docs/private'));
let target;
try {
  const read = filename => JSON.parse(fs.readFileSync(path.join(privateRoot, filename), 'utf8'));
  target = v1ProductionTarget(options, read('local-config.json'), read('production-discovery.json'), read('production-outputs.json'), repository, privateRoot);
} catch { throw new Error('The requested production target does not match private authorization; configuration values are withheld.'); }
const evidence = fs.mkdtempSync(path.join(privateRoot, 'v1-production-'));
const browserHome = path.join(evidence, 'browser-home');
fs.mkdirSync(browserHome);
fs.writeFileSync(path.join(evidence, 'v1-target.json'), JSON.stringify(target, null, 2));
if (!options.list) {
  let health;
  try {
    const response = await fetch(target.origin + '/health', { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error();
    health = await response.json();
  } catch { throw new Error('The authorized deployment could not be verified; no identities or model jobs were created.'); }
  if (!v1ProductionHealth(health, target.expectedGitRevision)) throw new Error('The deployment health or exact Git revision does not match; no identities or model jobs were created.');
  fs.writeFileSync(path.join(evidence, 'verified-health.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), gitRevision: health.gitRevision, runtime: health.runtime, provider: health.aiProvider, storageConnection: health.storageConnection }, null, 2));
}
const env = productionVerificationEnvironment({
  VERIFICATION_BASE_URL: target.origin, VERIFICATION_RUNTIME: 'production', CONNECTED_FIREBASE_TEST: '1', CONNECTED_FIREBASE_PROJECT_ID: target.firebaseProjectId,
  PRODUCTION_EVIDENCE_DIR: evidence, PLAYWRIGHT_BROWSERS_PATH: path.join(repository, '.cache/playwright'), APPDATA: browserHome, LOCALAPPDATA: browserHome, XDG_CONFIG_HOME: browserHome, XDG_CACHE_HOME: browserHome,
});
const args = ['node_modules/@playwright/test/cli.js', 'test', '--config=tests/live/v1-production.config.ts', ...(options.list ? ['--list'] : [])];
const log = fs.createWriteStream(path.join(evidence, 'run.log'));
const child = spawn(process.execPath, args, { cwd: repository, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
// Detailed failures stay in the explicitly private report, including any browser call logs.
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => log.write(chunk));
child.on('error', () => { log.end(); console.error('Production rehearsal could not start; details remain private.'); process.exitCode = 1; });
child.on('exit', code => { log.end(); console.log(JSON.stringify({ evidenceStoredPrivately: true, exactGitRevisionRequired: true, explicitJobBudget: 3, providerAttemptBudget: 6, exitCode: code })); process.exitCode = code ?? 1; });
