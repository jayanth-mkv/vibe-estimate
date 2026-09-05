import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Installs only inside infra/.tools. No global PATH, user config, or registry changes.
const version = '1.13.5';

// Official SHA256SUMS for this exact release. A platform without a pinned
// checksum is refused rather than installed unverified.
const releases = {
  'win32-x64': { archive: `terraform_${version}_windows_amd64.zip`, sha256: '73f97943c93f268ae2c645b2a737d552175aa64d00a5c8b8f5ccc5831c033c8a', binary: 'terraform.exe' },
  'linux-x64': { archive: `terraform_${version}_linux_amd64.zip`, sha256: '0dbe3fcc268eb670801af6a6456799d1ae26e72e73797f6c6167e18aafd1fd9a', binary: 'terraform' },
  'linux-arm64': { archive: `terraform_${version}_linux_arm64.zip`, sha256: 'fc1ddcb403fb57e25bdbdceb1ef2b1a102650c01b4d65dd3410082d2ef8b4417', binary: 'terraform' },
  'darwin-x64': { archive: `terraform_${version}_darwin_amd64.zip`, sha256: '92f76865230cbe6bb747e49cb3dc5b44a054324bbdd1a080bb127b326b94c404', binary: 'terraform' },
  'darwin-arm64': { archive: `terraform_${version}_darwin_arm64.zip`, sha256: '1bf942231235e7e1a4c38c6d7b820e54f526ac487f87d19f0c4a425c6ddb62cb', binary: 'terraform' },
};

const platform = `${process.platform}-${process.arch}`;
const release = releases[platform];
if (!release) {
  throw new Error(`No pinned Terraform ${version} checksum for ${platform}. Add the official SHA256 before installing.`);
}

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../.tools');
await mkdir(toolRoot, { recursive: true });
const response = await fetch(`https://releases.hashicorp.com/terraform/${version}/${release.archive}`);
if (!response.ok) throw new Error(`Official Terraform download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== release.sha256) {
  throw new Error('Terraform archive checksum does not match the pinned official SHA256.');
}
const archivePath = resolve(toolRoot, release.archive);
const destination = resolve(toolRoot, `terraform-${version}`);
await writeFile(archivePath, bytes);

// Paths are passed as environment values, never interpolated into shell code.
const extract = process.platform === 'win32'
  ? { command: 'powershell.exe', args: ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $env:VIBE_TERRAFORM_ZIP -DestinationPath $env:VIBE_TERRAFORM_DESTINATION -Force'] }
  : { command: 'unzip', args: ['-o', archivePath, '-d', destination] };
const result = spawnSync(extract.command, extract.args, {
  env: { ...process.env, VIBE_TERRAFORM_ZIP: archivePath, VIBE_TERRAFORM_DESTINATION: destination },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.platform !== 'win32') await chmod(resolve(destination, release.binary), 0o755);
console.log(`Installed Terraform ${version} for ${platform} in infra/.tools; official archive SHA256 verified.`);
