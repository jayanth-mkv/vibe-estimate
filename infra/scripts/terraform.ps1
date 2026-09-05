param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$TerraformArguments
)

$ErrorActionPreference = 'Stop'
$infraRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $infraRoot '.tools'
$terraformBinary = Join-Path $toolRoot 'terraform-1.13.5/terraform.exe'
if (-not (Test-Path -LiteralPath $terraformBinary)) {
  throw 'Project-local Terraform is missing. Read docs/terraform-setup.md for its pinned installation.'
}

$terraformTemp = Join-Path $toolRoot 'temp'
$terraformCache = Join-Path $toolRoot 'provider-cache'
$terraformConfig = Join-Path $toolRoot 'terraform.rc'
New-Item -ItemType Directory -Path $terraformTemp, $terraformCache -Force | Out-Null
Set-Content -LiteralPath $terraformConfig -Value 'disable_checkpoint = true'
$savedEnvironment = @{}
$overrides = @{
  TF_CLI_CONFIG_FILE = $terraformConfig
  TF_PLUGIN_CACHE_DIR = $terraformCache
  TF_DATA_DIR = (Join-Path $infraRoot '.terraform')
  CHECKPOINT_DISABLE = '1'
  TEMP = $terraformTemp
  TMP = $terraformTemp
}

try {
  foreach ($key in $overrides.Keys) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
  }
  & $terraformBinary @TerraformArguments
  $terraformExitCode = $LASTEXITCODE
} finally {
  foreach ($key in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
  }
}
exit $terraformExitCode
