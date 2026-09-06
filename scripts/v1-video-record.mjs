import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './local-env.mjs';
import { v1Environment } from './v1-env.mjs';

if (process.argv.length !== 2) throw new Error('The recording runner accepts no target override and connects only to the isolated fixture preview.');
const response = await fetch('http://127.0.0.1:3100/health', { signal: AbortSignal.timeout(10000) });
const health = await response.json();
if (!response.ok || health.runtime !== 'local' || health.aiProvider !== 'fixture' || health.auth !== 'emulator' || health.storageConnection !== 'emulator') throw new Error('Start the isolated fixture preview first; this recording must not contact a live provider.');
const directory = path.join(root, '.cache', 'v1', 'recording-' + new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(directory, { recursive: true });
for (const name of ['config', 'local', 'cache', 'tmp', 'evidence']) fs.mkdirSync(path.join(directory, name));
const env = { ...v1Environment(directory), V1_RECORDING_DIR: directory };
const child = spawn(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', 'tests/v1/recording.config.ts'], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
child.once('error', () => { process.exitCode = 1; });
const code = await new Promise(resolve => child.once('exit', resolve));
process.exitCode = code ?? 1;
console.log('Private synchronized recording evidence: ' + path.relative(root, directory));
