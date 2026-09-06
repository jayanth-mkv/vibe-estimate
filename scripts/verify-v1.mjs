import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './local-env.mjs';
import { runtimeCommand } from './runtime-command.mjs';

// Live inference is deliberately separate from the deterministic release gate.
// The final browser stage starts its own production frontend and empty emulators.
const checks = [
  ['configuration-and-invalid-startup', 'node', ['--test', 'tests/v1/env.test.mjs', 'tests/v1/startup.test.mjs', 'tests/v1/runtime-command.test.mjs', 'tests/live/v1-target.test.mjs']],
  ['typecheck', 'npm', ['run', 'typecheck']],
  ['browser-harness-typecheck', 'npm', ['run', 'typecheck:v1']],
  ['frontend-lint', 'npm', ['run', 'lint', '--workspace', '@vibeestimate/frontend']],
  ['frontend-tests', 'npm', ['run', 'test', '--workspace', '@vibeestimate/frontend']],
  ['backend-tests', 'npm', ['test']],
  ['existing-configuration', 'npm', ['run', 'test:config']],
  ['scene-tests', 'npm', ['run', 'test:spatial']],
  ['home-design-contracts', 'node', ['node_modules/tsx/dist/cli.mjs', '--test', 'tests/v1/design-core.test.ts']],
  ['release-boundaries', 'node', ['--test', 'infra/runtime/tests/release.test.mjs']],
  ['build', 'npm', ['run', 'build']],
  ['rules-and-all-browser-flows', 'node', ['scripts/v1-preview.mjs', 'test', '--legacy']],
  ['public-scan', 'npm', ['run', 'check:public']],
  ['terraform-merge-gate', 'npm', ['run', 'check:infra']],
  ['whitespace', 'git', ['diff', '--check']],
];
const directory = path.join(root, '.cache', 'v1', 'verification-' + new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'));
fs.mkdirSync(directory, { recursive: true });
const results = [];
for (const [name, kind, args] of checks) {
  console.log('Verifying ' + name + '.');
  const startedAt = new Date().toISOString();
  const log = fs.createWriteStream(path.join(directory, name + '.log'));
  const command = runtimeCommand(kind, args);
  const child = spawn(command.executable, command.args, { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', npm_config_cache: path.join(root, '.cache', 'npm') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log.write(chunk); process.stdout.write(chunk); });
  const code = await new Promise(resolve => { child.once('error', () => resolve(1)); child.once('exit', value => resolve(value ?? 1)); });
  await new Promise(resolve => log.end(resolve));
  results.push({ name, startedAt, finishedAt: new Date().toISOString(), exitCode: code });
  fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify({ provider: 'fixture', results, complete: results.length === checks.length && results.every(result => result.exitCode === 0) }, null, 2));
  if (code !== 0) { process.exitCode = code; console.error(name + ' failed. Remaining checks were not counted as passes.'); break; }
}
console.log('Verification evidence: ' + path.relative(root, directory));
