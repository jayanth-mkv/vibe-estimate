import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../../scripts/local-env.mjs';

const admissionFile = path.join(root, '.cache', 'v1-video-tools', 'admission.json');
test('Actual encoded streams align a delayed common marker and compose a playable video', { skip: !fs.existsSync(admissionFile), timeout: 180000 }, () => {
  const { executable } = JSON.parse(fs.readFileSync(admissionFile, 'utf8'));
  const directory = fs.mkdtempSync(path.join(root, '.cache', 'v1', 'composition-smoke-'));
  const starts = [2, 3.3];
  for (const [index, name] of ['designer', 'homeowner'].entries()) {
    const result = spawnSync(executable, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-f', 'lavfi', '-i', 'color=c=' + (index ? 'tan' : 'royalblue') + ':s=160x120:r=25:d=16', '-vf', 'drawbox=x=0:y=0:w=16:h=16:color=magenta:t=fill:enable=gte(t\\,' + starts[index] + ')', '-c:v', 'libvpx', '-threads', '2', '-deadline', 'realtime', '-cpu-used', '8', '-an', path.join(directory, name + '.webm')], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
  }
  fs.writeFileSync(path.join(directory, 'dual-capture.json'), JSON.stringify({ schemaVersion: 1, complete: true, provider: 'fixture', syntheticTestOnly: true, streams: { designer: 'designer.webm', homeowner: 'homeowner.webm' }, redactedBeforeRender: ['invitation code', 'invitation QR'] }));
  const composed = spawnSync(process.execPath, ['scripts/v1-video-compose.mjs', '--manifest', path.join(directory, 'dual-capture.json')], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90000 });
  assert.equal(composed.status, 0, composed.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'composition.json'), 'utf8'));
  for (const [index, actual] of report.inputStartSeconds.entries()) assert.ok(Math.abs(actual - starts[index]) <= 0.1, 'Synchronization must follow the encoded frame markers.');
  assert.equal(report.width, 1904); assert.equal(report.height, 1080); assert.equal(report.fps, 25);
  assert.ok(fs.statSync(path.join(directory, report.output)).size > 10000);
  const probe = spawnSync(path.join(path.dirname(executable), 'ffprobe.exe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', path.join(directory, report.output)], { encoding: 'utf8', windowsHide: true });
  assert.equal(probe.status, 0);
  assert.deepEqual(JSON.parse(probe.stdout).streams[0], { codec_name: 'h264', width: 1904, height: 1080 });
});
