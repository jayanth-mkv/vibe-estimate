import path from 'node:path';
import { productionVerificationEnvironment } from './production-verification-env.mjs';
import { localEnv, root } from './local-env.mjs';

export const v1Target = Object.freeze({ appOrigin: 'http://127.0.0.1:3100', apiOrigin: 'http://127.0.0.1:8181', authOrigin: 'http://127.0.0.1:9299', firestoreHost: '127.0.0.1:8285', projectId: 'demo-vibeestimate', ports: [3100, 8181, 9299, 8285, 4403, 4503, 9153] });

export function v1Arguments(args) {
  const mode = args[0] ?? 'start';
  if (!['start', 'test', 'review'].includes(mode)) throw new Error('Use start, test or review.');
  let geminiConfig;
  let grep;
  let legacy = false;
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--legacy' && !legacy && mode === 'test') { legacy = true; continue; }
    if (!['--gemini-config', '--grep'].includes(flag) || !args[index + 1]?.trim() || args[index + 1].startsWith('--')) throw new Error('Use only --gemini-config <external private JSON>, --grep <pattern>, or --legacy.');
    const value = args[++index];
    if (flag === '--gemini-config' && !geminiConfig) geminiConfig = value;
    else if (flag === '--grep' && !grep && mode === 'test') grep = value;
    else throw new Error('Repeated or incompatible verification option.');
  }
  if (geminiConfig && (legacy || grep)) throw new Error('Live verification uses its one bounded journey; repetitions and legacy fixture tests are unavailable.');
  return { mode, geminiConfig, grep, legacy };
}

/** No inherited credentials, cloud profiles, debug capture or public settings survive. */
export function v1Environment(runDirectory, inherited = process.env) {
  if (Object.entries(inherited).some(([key, value]) => key.toUpperCase() === 'K_SERVICE' && value || key.toUpperCase() === 'APP_ENV' && value === 'production')) throw new Error('V1 preview is restricted to a local process outside the production service.');
  const run = path.resolve(runDirectory);
  const cacheRoot = path.join(root, '.cache', 'v1');
  const relative = path.relative(cacheRoot, run);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('V1 evidence must be in a new run below the repository .cache/v1 directory.');
  return {
    ...localEnv(productionVerificationEnvironment({}, inherited)),
    NODE_ENV: 'production', APP_ENV: 'local', AI_PROVIDER: 'fixture',
    FRONTEND_ORIGIN: v1Target.appOrigin, PORT: '8181', BACKEND_ORIGIN: v1Target.apiOrigin,
    NEXT_PUBLIC_AUTH_MODE: 'guest', NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'false', NEXT_PUBLIC_API_URL: '',
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: v1Target.authOrigin,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9299', FIRESTORE_EMULATOR_HOST: v1Target.firestoreHost,
    VIBEESTIMATE_E2E_BASE_URL: v1Target.appOrigin, VIBEESTIMATE_E2E_API_ORIGIN: v1Target.apiOrigin,
    VIBEESTIMATE_E2E_AUTH_ORIGIN: v1Target.authOrigin,
    V1_EVIDENCE_DIR: run, V1_PROVIDER: 'fixture',
    APPDATA: path.join(run, 'config'), LOCALAPPDATA: path.join(run, 'local'),
    XDG_CONFIG_HOME: path.join(run, 'config'), XDG_CACHE_HOME: path.join(run, 'cache'),
    TEMP: path.join(run, 'tmp'), TMP: path.join(run, 'tmp'),
    PLAYWRIGHT_HTML_OPEN: 'never', PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(run, 'report'),
  };
}

export function v1HealthMatches(health, provider = 'fixture') {
  return health?.status === 'ok' && health.runtime === 'local' && health.aiProvider === provider
    && health.auth === 'emulator' && health.storage === 'firestore' && health.storageConnection === 'emulator';
}
