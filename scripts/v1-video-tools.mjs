import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root } from './local-env.mjs';

// FFmpeg's official download page links this Windows distributor. Keep the
// pinned GPLv3 archive, its licence and provenance local; never install globally.
const url = 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.1-essentials_build.zip';
const sha256 = 'fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9';
const directory = path.join(root, '.cache', 'v1-video-tools');
if (process.platform !== 'win32' || process.argv.length !== 2) throw new Error('This pinned local tool installer supports Windows with no arguments.');
fs.mkdirSync(directory, { recursive: true });
const archive = path.join(directory, 'ffmpeg-9.0.1-essentials_build.zip');
if (!fs.existsSync(archive)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 150000000) throw new Error('The pinned FFmpeg archive is unavailable.');
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
}
if (createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== sha256) throw new Error('FFmpeg archive checksum mismatch; no executable was admitted.');
const extracted = path.join(directory, 'ffmpeg-9.0.1-essentials_build');
if (!fs.existsSync(extracted)) {
  // Windows bsdtar reads ZIP; Git's GNU tar earlier on PATH does not.
  const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const result = spawnSync(tar, ['-xf', archive, '-C', directory], { windowsHide: true, stdio: 'pipe' });
  if (result.status !== 0) throw new Error('Local FFmpeg archive extraction failed.');
}
const executable = path.join(extracted, 'bin', 'ffmpeg.exe');
const filters = spawnSync(executable, ['-hide_banner', '-filters'], { encoding: 'utf8', windowsHide: true });
for (const filter of ['hstack', 'vstack', 'fps', 'setpts', 'drawbox']) if (!filters.stdout?.includes(filter)) throw new Error('Required FFmpeg video composition filters are missing.');
fs.writeFileSync(path.join(directory, 'admission.json'), JSON.stringify({ source: 'https://ffmpeg.org/download.html', distributor: 'https://www.gyan.dev/ffmpeg/builds/', archive: url, checksumSource: url + '.sha256', sha256, licence: 'GPLv3; local tooling only', executable, executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), installedAt: new Date().toISOString() }, null, 2));
console.log('Pinned FFmpeg admitted in the repository cache; hstack and synchronization filters are available.');
