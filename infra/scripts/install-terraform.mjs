import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Installs only inside infra/.tools. No global PATH, user config, or registry changes.
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('This helper targets Windows x64. Use Terraform 1.13.5 for your platform and the checked-in lock file.');
}
const version = '1.13.5';
const archive = `terraform_${version}_windows_amd64.zip`;
const expectedSha256 = '73f97943c93f268ae2c645b2a737d552175aa64d00a5c8b8f5ccc5831c033c8a';
const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../.tools');
await mkdir(toolRoot, { recursive: true });
const response = await fetch(`https://releases.hashicorp.com/terraform/${version}/${archive}`);
if (!response.ok) throw new Error(`Official Terraform download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) {
  throw new Error('Terraform archive checksum does not match the pinned official SHA256.');
}
const archivePath = resolve(toolRoot, archive);
const destination = resolve(toolRoot, `terraform-${version}`);
await writeFile(archivePath, bytes);
// Paths are passed as environment values, never interpolated into shell code.
const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:VIBE_TERRAFORM_ZIP -DestinationPath $env:VIBE_TERRAFORM_DESTINATION -Force'], {
  env: { ...process.env, VIBE_TERRAFORM_ZIP: archivePath, VIBE_TERRAFORM_DESTINATION: destination },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Installed Terraform ${version} in infra/.tools; official archive SHA256 verified.`);
