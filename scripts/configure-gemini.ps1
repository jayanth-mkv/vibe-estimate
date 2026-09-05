param([string]$PrivateDirectory = '')

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'private-path.ps1')
if (-not $PrivateDirectory) { $PrivateDirectory = Join-Path $PSScriptRoot '../../docs/private' }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$privateRoot = Assert-PrivatePath -Path $PrivateDirectory -RepositoryRoot $repoRoot -Kind Directory
$contextPath = Assert-PrivatePath -Path (Join-Path $privateRoot 'local-config.json') -RepositoryRoot $repoRoot -Kind File
$configPath = Assert-PrivatePath -Path (Join-Path $privateRoot 'gemini-local.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
try { $context = Get-Content -LiteralPath $contextPath -Raw | ConvertFrom-Json }
catch { throw 'Private operator configuration could not be read; contents omitted.' }
foreach ($property in @('gcloudConfiguration', 'account', 'backendProjectId')) {
  if ([string]::IsNullOrWhiteSpace($context.$property)) { throw 'Private cloud configuration is incomplete.' }
}
$flags = @(('--configuration=' + $context.gcloudConfiguration), ('--account=' + $context.account), ('--project=' + $context.backendProjectId), '--quiet')
$savedEnvironment = @{}
$overrides = @{
  CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT = $null
  CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE = $null
  CLOUDSDK_AUTH_ACCESS_TOKEN = $null
  CLOUDSDK_AUTH_ACCESS_TOKEN_FILE = $null
  CLOUDSDK_CORE_LOG_HTTP = 'false'
  CLOUDSDK_CORE_VERBOSITY = 'error'
}
try {
foreach ($key in $overrides.Keys) {
  $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
  [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
}
$configDirectory = ((& gcloud @flags info '--format=value(config.paths.global_config_dir)' 2>$null) -join '').Trim()
if ($LASTEXITCODE -ne 0 -or -not $configDirectory) { throw 'The authorized gcloud configuration directory could not be verified.' }
$configDirectory = Assert-PrivatePath -Path $configDirectory -RepositoryRoot $repoRoot -Kind Directory
$null = Assert-PrivatePath -Path (Join-Path $configDirectory 'application_default_credentials.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
$profileOutput = & gcloud @flags config list --format=json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'The authorized cloud profile could not be verified.' }
$profile = ($profileOutput -join '') | ConvertFrom-Json
if ($profile.core.account -ne $context.account -or $profile.core.project -ne $context.backendProjectId -or $profile.auth.impersonate_service_account -or $profile.auth.credential_file_override -or $profile.auth.access_token_file) { throw 'The cloud profile does not match private authorization.' }
$keyResource = 'projects/' + $context.backendProjectId + '/locations/global/keys/vibeestimate-local-gemini'
$metadataOutput = & gcloud @flags services api-keys describe $keyResource --format=json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'The Terraform-managed Gemini key was not found.' }
$metadata = ($metadataOutput -join '') | ConvertFrom-Json
$expectedIdentity = 'vibeestimate-local-gemini@' + $context.backendProjectId + '.iam.gserviceaccount.com'
if ($metadata.serviceAccountEmail -ne $expectedIdentity -or @($metadata.restrictions.apiTargets).Count -ne 1 -or $metadata.restrictions.apiTargets[0].service -ne 'generativelanguage.googleapis.com' -or $metadata.deleteTime) {
  throw 'The existing key must be active, bound to the dedicated identity, and restricted solely to Gemini.'
}
$credentialOutput = & gcloud @flags services api-keys get-key-string $keyResource --format=json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Credential retrieval failed. No payload was displayed.' }
try { $credential = ($credentialOutput -join '') | ConvertFrom-Json }
catch { throw 'Credential retrieval returned an invalid response. No payload was displayed.' }
if ([string]::IsNullOrWhiteSpace($credential.keyString)) { throw 'Credential retrieval returned no usable key.' }
$config = [ordered]@{ apiKey = $credential.keyString; model = 'unselected' }
# UTF-8 without a BOM is directly readable by the Node local runner.
Write-PrivateUtf8Text -Path $configPath -RepositoryRoot $repoRoot -Text (($config | ConvertTo-Json) + [Environment]::NewLine)
$credentialOutput = $null
$credential = $null
$config = $null
Write-Output 'Verified the Terraform-managed authorization key and wrote private gemini-local.json. No credential value was displayed.'
Write-Output 'Next: use scripts/gemini-models.mjs with that private file to discover and select an available model.'
} finally {
  $credentialOutput = $null
  $credential = $null
  $config = $null
  foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
}
