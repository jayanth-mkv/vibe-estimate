param()

$ErrorActionPreference = 'Stop'
$infraRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $infraRoot
$toolRoot = Join-Path $infraRoot '.tools'
$terraformBinary = Join-Path $toolRoot 'terraform-1.13.5/terraform.exe'
if (-not (Test-Path -LiteralPath $terraformBinary)) {
  throw 'Install the pinned project-local Terraform CLI before offline checks.'
}
$temporaryRoot = Join-Path $toolRoot 'temp'
$providerCache = Join-Path $toolRoot 'provider-cache'
$dataRoot = Join-Path $repoRoot '.cache/terraform-gemini-offline'
$cliConfig = Join-Path $toolRoot 'terraform-gemini-offline.rc'
New-Item -ItemType Directory -Path $temporaryRoot, $providerCache, $dataRoot -Force | Out-Null
Set-Content -LiteralPath $cliConfig -Value 'disable_checkpoint = true'
$overrides = @{
  TF_CLI_CONFIG_FILE = $cliConfig
  TF_PLUGIN_CACHE_DIR = $providerCache
  TF_DATA_DIR = $dataRoot
  CHECKPOINT_DISABLE = '1'
  TEMP = $temporaryRoot
  TMP = $temporaryRoot
  TF_LOG = $null
  TF_LOG_PROVIDER = $null
  TF_LOG_PATH = $null
  TF_VAR_project_id = $null
  TF_VAR_provision_gemini = $null
  TF_VAR_access_token = $null
  TF_VAR_key_id = $null
  TF_VAR_service_account_id = $null
}
$savedEnvironment = @{}
$terraformRoot = Join-Path $infraRoot 'gemini-local'
try {
  foreach ($key in $overrides.Keys) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
  }
  & $terraformBinary "-chdir=$terraformRoot" fmt -recursive
  if ($LASTEXITCODE -ne 0) { throw 'Terraform formatting failed.' }
  & $terraformBinary "-chdir=$terraformRoot" init -backend=false -input=false -no-color
  if ($LASTEXITCODE -ne 0) { throw 'Terraform provider initialization failed.' }
  & $terraformBinary "-chdir=$terraformRoot" validate -no-color
  if ($LASTEXITCODE -ne 0) { throw 'Terraform validation failed.' }
  & $terraformBinary "-chdir=$terraformRoot" test -no-color
  if ($LASTEXITCODE -ne 0) { throw 'Terraform mock tests failed.' }
} finally {
  foreach ($key in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
  }
}
