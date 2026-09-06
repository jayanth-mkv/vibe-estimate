import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { root } from './local-env.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--manifest') throw new Error('Use --manifest <dual-capture.json>. Only a complete redacted two-role recording is accepted.');
const manifestPath = path.resolve(args[1]), directory = path.dirname(manifestPath);
const capture = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (capture.schemaVersion !== 1 || !capture.complete || !['fixture', 'gemini'].includes(capture.provider) || capture.streams.designer !== 'designer.webm' || capture.streams.homeowner !== 'homeowner.webm' || !capture.redactedBeforeRender.includes('invitation code') || !capture.redactedBeforeRender.includes('invitation QR')) throw new Error('A completed, redacted recording manifest is required.');
const toolsDirectory = path.join(root, '.cache', 'v1-video-tools');
const admission = JSON.parse(fs.readFileSync(path.join(toolsDirectory, 'admission.json'), 'utf8'));
const executable = path.resolve(admission.executable);
if (!executable.startsWith(toolsDirectory + path.sep) || createHash('sha256').update(fs.readFileSync(executable)).digest('hex') !== admission.executableSha256) throw new Error('The locally admitted FFmpeg executable must match its checksum.');
const execute = (argv, binary = false) => new Promise((resolve, reject) => {
  const child = spawn(executable, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2', ...argv], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [], errors = []; let size = 0;
  child.stdout.on('data', chunk => { size += chunk.length; if (size > 1000000) child.kill(); else chunks.push(chunk); });
  child.stderr.on('data', chunk => errors.push(chunk));
  child.once('error', () => reject(new Error('Local video composition could not start.')));
  child.once('exit', code => code === 0 ? resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString()) : reject(new Error('Local video composition failed: ' + Buffer.concat(errors).toString().slice(-1000))));
});
async function marker(filename) {
  // The actual captured marker, not process launch time, establishes alignment.
  const pixels = await execute(['-i', filename, '-t', '120', '-vf', 'fps=10,crop=2:2:6:6,format=rgb24', '-f', 'rawvideo', 'pipe:1'], true);
  for (let offset = 0; offset < pixels.length; offset += 12) {
    if (pixels[offset] > 180 && pixels[offset + 1] < 80 && pixels[offset + 2] > 150) return offset / 12 / 10;
  }
  throw new Error('A shared synchronization marker was not captured in both role streams.');
}
const designer = path.join(directory, capture.streams.designer), homeowner = path.join(directory, capture.streams.homeowner);
const starts = [await marker(designer), await marker(homeowner)];
const header = path.join(directory, 'recording-header.png');
const subtitle = capture.provider === 'gemini' ? 'Gemini · one shared home, exact design decisions and a saved draft agreement' : 'Fixture rehearsal · real separate identities and interactions · no paid model calls';
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1904" height="80"><rect width="1904" height="80" fill="#142332"/><g fill="white" font-family="Segoe UI,Arial,sans-serif"><text x="24" y="29" font-size="23" font-weight="700">Designer · desktop</text><text x="1464" y="29" font-size="23" font-weight="700">Homeowner · mobile</text><text x="24" y="60" font-size="17">' + subtitle + '</text></g></svg>')).png().toFile(header);
const output = path.join(directory, 'designer-homeowner.mp4');
if (fs.existsSync(output)) throw new Error('The composed video already exists; preserve it and choose a fresh capture directory.');
const graph = '[0:v]trim=start=' + starts[0] + ',setpts=PTS-STARTPTS,fps=25,drawbox=x=0:y=0:w=16:h=16:color=0x142332:t=fill,scale=1440:1000:force_original_aspect_ratio=decrease,pad=1440:1000:0:0:color=0x142332[d];[1:v]trim=start=' + starts[1] + ',setpts=PTS-STARTPTS,fps=25,drawbox=x=0:y=0:w=16:h=16:color=0x142332:t=fill,scale=464:1000:force_original_aspect_ratio=decrease,pad=464:1000:0:0:color=0x142332[h];[d][h]hstack=shortest=1[b];[2:v][b]vstack=shortest=1,format=yuv420p[out]';
await execute(['-i', designer, '-threads', '2', '-i', homeowner, '-loop', '1', '-i', header, '-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', '-n', output]);
await execute(['-i', output, '-ss', '10', '-frames:v', '1', '-n', path.join(directory, 'designer-homeowner-review.png')]);
fs.writeFileSync(path.join(directory, 'composition.json'), JSON.stringify({ schemaVersion: 1, inputManifest: 'dual-capture.json', output: 'designer-homeowner.mp4', width: 1904, height: 1080, fps: 25, inputStartSeconds: starts, alignmentResolutionMilliseconds: 100, timing: 'Original real-time sequence retained; only pre-start waiting is trimmed.', provider: capture.provider, syntheticElements: ['role labels', 'cursor and click indicators', 'redaction of invitation credentials'], sha256: createHash('sha256').update(fs.readFileSync(output)).digest('hex'), bytes: fs.statSync(output).size }, null, 2));
console.log('Synchronized side-by-side video and review frame created beside the private capture manifest.');
