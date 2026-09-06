import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { productionVerificationEnvironment } from '../../scripts/production-verification-env.mjs';

test('production launcher refuses incomplete settings before starting either server', () => {
  const inherited = productionVerificationEnvironment({}, process.env);
  for (const settings of [{}, { APP_ENV: 'production', NODE_ENV: 'production' }, { APP_ENV: 'local', NODE_ENV: 'production', FIREBASE_WEB_CONFIG: '{}' }]) {
    const result = spawnSync(process.execPath, ['scripts/start-production.mjs'], { env: { ...inherited, ...settings }, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Explicit production settings are required/);
    assert.equal(result.error, undefined);
  }
});
