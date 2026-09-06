import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runtimeCommand } from '../../scripts/runtime-command.mjs';

test('packaged Node and npm commands execute without the agent RTK wrapper', () => {
  const node = runtimeCommand('node', ['-e', 'process.stdout.write("runner-ok")']);
  const child = spawnSync(node.executable, node.args, { encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0); assert.equal(child.stdout, 'runner-ok');
  const npm = runtimeCommand('npm', ['--version']);
  assert.notEqual(npm.executable, 'rtk');
  const version = spawnSync(npm.executable, npm.args, { encoding: 'utf8', windowsHide: true });
  assert.equal(version.status, 0); assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('Windows npm.cmd fallback handles only fixed safe arguments and POSIX uses executable npm', () => {
  const options = { platform: 'win32', execPath: 'C:\\Node\\node.exe', env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }, exists: () => false };
  assert.deepEqual(runtimeCommand('npm', ['run', 'typecheck'], options), { executable: options.env.ComSpec, args: ['/d', '/s', '/c', 'npm.cmd run typecheck'] });
  for (const argument of ['run & echo secret', '$(echo secret)', '`echo secret`', 'run; echo secret', 'two words']) assert.throws(() => runtimeCommand('npm', [argument], options));
  assert.deepEqual(runtimeCommand('npm', ['run', 'typecheck'], { ...options, platform: 'linux', execPath: '/usr/bin/node', env: {} }), { executable: 'npm', args: ['run', 'typecheck'] });
});
