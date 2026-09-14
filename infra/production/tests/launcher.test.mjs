import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRoomRecoveryPaused, roomRecoveryPaused } from '../../../scripts/terraform-production.mts';

const backendProjectId = 'example-backend';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cache = path.join(repository, '.cache', 'production-launcher-tests');


function fixture(t) {
  fs.mkdirSync(cache, { recursive: true });
  const directory = fs.mkdtempSync(path.join(cache, 'run-'));
  const privateRoot = path.join(directory, 'private');
  fs.mkdirSync(privateRoot);
  t.after(() => {
    const canonical = fs.realpathSync(directory);
    assert.equal(path.dirname(canonical), fs.realpathSync(cache));
    assert.ok(path.basename(canonical).startsWith('run-'));
    fs.rmSync(canonical, { recursive: true });
  });
  return { directory, privateRoot, file: path.join(privateRoot, 'room-recovery.json') };
}

test('recovery defaults paused and accepts only an explicit boolean for the authorized backend', () => {
  assert.equal(roomRecoveryPaused(undefined, backendProjectId), true);
  assert.equal(roomRecoveryPaused({ backendProjectId, paused: false }, backendProjectId), false);
  assert.equal(roomRecoveryPaused({ backendProjectId, paused: true }, backendProjectId), true);
  for (const config of [null, [], {}, { paused: true }, { backendProjectId },
    { backendProjectId: 'other-backend', paused: true }, { backendProjectId, paused: 'true' },
    { backendProjectId, paused: 1 }, { backendProjectId, paused: null },
    { backendProjectId, paused: true, schedule: '*/15 * * * *' }]) {
    assert.throws(() => roomRecoveryPaused(config, backendProjectId));
  }
  assert.throws(() => roomRecoveryPaused({ backendProjectId: '', paused: true }, ''));
});

test('an absent private recovery file keeps the scheduler paused; valid files preserve the explicit setting', t => {
  const { privateRoot, file } = fixture(t);
  assert.equal(privateRoomRecoveryPaused(privateRoot, backendProjectId), true);
  for (const paused of [true, false]) {
    fs.writeFileSync(file, JSON.stringify({ backendProjectId, paused }));
    assert.equal(privateRoomRecoveryPaused(privateRoot, backendProjectId), paused);
  }
});

test('malformed, oversized, non-file and wrong-target private recovery settings fail closed', t => {
  const { privateRoot, file } = fixture(t);
  for (const body of ['{', ' '.repeat(32769), JSON.stringify({ backendProjectId: 'other-backend', paused: true }), JSON.stringify({ backendProjectId, paused: 'true' })]) {
    fs.writeFileSync(file, body);
    assert.throws(() => privateRoomRecoveryPaused(privateRoot, backendProjectId));
  }
  fs.unlinkSync(file);
  fs.mkdirSync(file);
  assert.throws(() => privateRoomRecoveryPaused(privateRoot, backendProjectId));
});

test('a recovery configuration symlink cannot escape its private directory', t => {
  const { directory, privateRoot, file } = fixture(t);
  const outside = path.join(directory, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, file, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => privateRoomRecoveryPaused(privateRoot, backendProjectId), /must stay in the private directory/);
});
