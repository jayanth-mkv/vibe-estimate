import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline configuration checks for every Terraform root: formatting, schema
// validation and the mock-provider suites. Init runs with -backend=false, so no
// state is read or written and no cloud credential is used or required.
const infraRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolRoot = resolve(infraRoot, '.tools');
const binary = resolve(toolRoot, 'terraform-1.13.5', process.platform === 'win32' ? 'terraform.exe' : 'terraform');
const roots = ['production', 'delivery', 'runtime', 'firebase-adoption', 'gemini-local'];

if (!existsSync(binary)) {
  console.error('Project-local Terraform is missing. Run: node infra/scripts/install-terraform.mjs');
  process.exit(1);
}

const cache = resolve(toolRoot, 'provider-cache');
const config = resolve(toolRoot, 'check.rc');
mkdirSync(cache, { recursive: true });
writeFileSync(config, 'disable_checkpoint = true\n');

// Inherited cloud credentials and debug capture must not influence these checks.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TF_|GOOGLE_|GCLOUD_|CLOUDSDK_|CLOUDFLARE_|CF_|VERCEL_)/i.test(key)));
Object.assign(env, {
  TF_CLI_CONFIG_FILE: config,
  TF_PLUGIN_CACHE_DIR: cache,
  TF_IN_AUTOMATION: '1',
  CHECKPOINT_DISABLE: '1',
});

function terraform(args, { dataDir } = {}) {
  const result = spawnSync(binary, args, {
    cwd: infraRoot,
    env: dataDir ? { ...env, TF_DATA_DIR: dataDir } : env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const failures = [];

console.log('== terraform fmt -check -recursive ==');
if (terraform(['fmt', '-check', '-recursive', '-no-color', '.']) !== 0) failures.push('fmt');

for (const root of roots) {
  console.log(`\n== ${root} ==`);
  const dataDir = resolve(toolRoot, 'check-data', root);
  if (terraform([`-chdir=${root}`, 'init', '-backend=false', '-input=false', '-no-color'], { dataDir }) !== 0) {
    failures.push(`${root}: init`);
    continue;
  }
  if (terraform([`-chdir=${root}`, 'validate', '-no-color'], { dataDir }) !== 0) failures.push(`${root}: validate`);
  if (existsSync(resolve(infraRoot, root, 'tests'))) {
    if (terraform([`-chdir=${root}`, 'test', '-no-color'], { dataDir }) !== 0) failures.push(`${root}: test`);
  } else {
    console.log(`(${root} has no test suite)`);
  }
}

if (failures.length > 0) {
  console.error(`\nInfrastructure checks failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll Terraform roots formatted, valid, and passing their mock suites. No cloud API call was made.');
