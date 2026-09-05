param(
  [string]$PrivateDirectory = '',
  [ValidatePattern('^[a-zA-Z0-9._-]+$')][string]$Model = 'gemini-3.6-flash',
  [ValidatePattern('^(global|[a-z]+-[a-z]+\d+)$')][string]$Location = 'global'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'private-path.ps1')
if (-not $PrivateDirectory) { $PrivateDirectory = Join-Path $PSScriptRoot '../../docs/private' }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$privateRoot = Assert-PrivatePath -Path $PrivateDirectory -RepositoryRoot $repoRoot -Kind Directory
$contextPath = Assert-PrivatePath -Path (Join-Path $privateRoot 'local-config.json') -RepositoryRoot $repoRoot -Kind File
$settingsPath = Assert-PrivatePath -Path (Join-Path $privateRoot 'vertex-local.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
try { $context = Get-Content -LiteralPath $contextPath -Raw | ConvertFrom-Json }
catch { throw 'Private operator configuration could not be read; contents omitted.' }
foreach ($property in @('gcloudConfiguration', 'account', 'backendProjectId')) {
  if ([string]::IsNullOrWhiteSpace($context.$property)) { throw 'The private cloud profile, account and backend project are required.' }
}
$flags = @(('--configuration=' + $context.gcloudConfiguration), ('--account=' + $context.account), ('--project=' + $context.backendProjectId), '--quiet')
$savedEnvironment = @{}
$overrides = @{ CLOUDSDK_CORE_LOG_HTTP = 'false'; CLOUDSDK_CORE_VERBOSITY = 'error' }
foreach ($name in [Environment]::GetEnvironmentVariables('Process').Keys) { if ($name -like 'CLOUDSDK_AUTH_*') { $overrides[$name] = $null } }
function Read-Cloud([string[]]$Arguments) {
  $prior = $ErrorActionPreference
  try { $ErrorActionPreference = 'Continue'; $captured = & gcloud @flags @Arguments 2>$null; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $prior }
  if ($code -ne 0) { throw 'The authorized cloud metadata read failed; raw output omitted.' }
  return ($captured -join [Environment]::NewLine)
}
function File-Digest([string]$FilePath) {
  $FilePath = Assert-PrivatePath -Path $FilePath -RepositoryRoot $repoRoot -Kind File -AllowMissing
  if (-not [IO.File]::Exists($FilePath)) { return 'absent' }
  $digest = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToBase64String($digest.ComputeHash([IO.File]::ReadAllBytes($FilePath))) }
  finally { $digest.Dispose() }
}
try {
  foreach ($name in $overrides.Keys) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $overrides[$name], 'Process')
  }
  $configDirectory = (Read-Cloud @('info', '--format=value(config.paths.global_config_dir)')).Trim()
  $configDirectory = Assert-PrivatePath -Path $configDirectory -RepositoryRoot $repoRoot -Kind Directory
  $adcPath = Assert-PrivatePath -Path (Join-Path $configDirectory 'application_default_credentials.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
  $adcBefore = File-Digest $adcPath
  try { $profile = (Read-Cloud @('config', 'list', '--format=json')) | ConvertFrom-Json }
  catch { throw 'The authorized profile could not be verified; raw output omitted.' }
  if ($profile.core.account -ne $context.account -or $profile.core.project -ne $context.backendProjectId -or $profile.auth.impersonate_service_account -or $profile.auth.credential_file_override -or $profile.auth.access_token_file) { throw 'The cloud profile does not match private authorization.' }
  $service = (Read-Cloud @('services', 'list', '--enabled', '--filter=config.name:aiplatform.googleapis.com', '--format=value(config.name)')).Trim()
  if ($service -ne 'aiplatform.googleapis.com') { throw 'Enable the Vertex API through the reviewed Terraform configuration first.' }
  $settings = [ordered]@{
    transport = 'vertex'; projectId = $context.backendProjectId; location = $Location; model = $Model
    gcloudConfiguration = $context.gcloudConfiguration; account = $context.account; gcloudConfigDir = $configDirectory
  }
  Write-PrivateUtf8Text -Path $settingsPath -RepositoryRoot $repoRoot -Text (($settings | ConvertTo-Json) + [Environment]::NewLine)
  Write-Output 'Verified the authorized profile and Vertex API. Saved private vertex-local.json; no tokens, keys or ADC credentials were copied.'
} finally {
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  if ($adcPath -and $adcBefore) {
    if ((File-Digest $adcPath) -ne $adcBefore) { throw 'Shared ADC changed; investigate before continuing.' }
    Write-Output 'Shared ADC unchanged (SHA256 comparison).'
  }
}
