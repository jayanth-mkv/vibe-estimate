param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('init', 'plan', 'bootstrap-plan', 'repair-api-state', 'apply', 'check')]
  [string]$Action,
  [string]$PrivateDirectory = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'private-path.ps1')
if (-not $PrivateDirectory) { $PrivateDirectory = Join-Path $PSScriptRoot '../../docs/private' }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$privateRoot = Assert-PrivatePath -Path $PrivateDirectory -RepositoryRoot $repoRoot -Kind Directory
$contextPath = Assert-PrivatePath -Path (Join-Path $privateRoot 'local-config.json') -RepositoryRoot $repoRoot -Kind File
try { $context = Get-Content -LiteralPath $contextPath -Raw | ConvertFrom-Json }
catch { throw 'Private operator configuration could not be read; contents omitted.' }
if ($null -ne $context.enableVertexAi -and $context.enableVertexAi -isnot [bool]) { throw 'The private Vertex opt-in must be a JSON boolean.' }
$enableVertexAi = $context.enableVertexAi -eq $true
foreach ($property in @('gcloudConfiguration', 'account', 'backendProjectId')) {
  if ([string]::IsNullOrWhiteSpace($context.$property)) { throw 'Private local-config.json is missing the explicit cloud profile, account, or project.' }
}
$terraform = Join-Path $repoRoot 'infra/.tools/terraform-1.13.5/terraform.exe'
if (-not (Test-Path -LiteralPath $terraform)) { throw 'Install the project-local Terraform binary first.' }
$workRoot = Join-Path $repoRoot 'infra/gemini-local'
$privateTerraform = Assert-PrivatePath -Path (Join-Path $privateRoot 'terraform') -RepositoryRoot $repoRoot -Kind Directory -AllowMissing
$cacheRoot = Join-Path $repoRoot '.cache/terraform-gemini'
$providerCache = Join-Path $repoRoot 'infra/.tools/provider-cache'
New-Item -ItemType Directory -Force -Path $privateTerraform, $cacheRoot, $providerCache | Out-Null
$planPath = Assert-PrivatePath -Path (Join-Path $privateTerraform 'gemini.tfplan') -RepositoryRoot $repoRoot -Kind File -AllowMissing
$planContextPath = Assert-PrivatePath -Path (Join-Path $privateTerraform 'gemini.plan-context.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
$statePath = Assert-PrivatePath -Path (Join-Path $privateTerraform 'gemini.tfstate') -RepositoryRoot $repoRoot -Kind File -AllowMissing
$cliConfig = Join-Path $cacheRoot 'terraform.rc'
Set-Content -LiteralPath $cliConfig -Value 'disable_checkpoint = true'
$savedEnvironment = @{}
$overrides = @{
  TF_DATA_DIR = (Join-Path $cacheRoot 'data')
  TF_CLI_CONFIG_FILE = $cliConfig
  TF_PLUGIN_CACHE_DIR = $providerCache
  CHECKPOINT_DISABLE = '1'
  TF_IN_AUTOMATION = '1'
  TF_WORKSPACE = 'default'
  TF_VAR_project_id = $context.backendProjectId
  TF_VAR_provision_gemini = 'true'
  TF_VAR_enable_vertex_ai = $enableVertexAi.ToString().ToLowerInvariant()
  GOOGLE_CLOUD_QUOTA_PROJECT = $context.backendProjectId
  TF_LOG = $null
  TF_LOG_PATH = $null
  TF_LOG_PROVIDER = $null
  TF_LOG_CORE = $null
  GOOGLE_APPLICATION_CREDENTIALS = $null
  GOOGLE_CREDENTIALS = $null
  GOOGLE_CLOUD_KEYFILE_JSON = $null
  GCLOUD_KEYFILE_JSON = $null
  GOOGLE_OAUTH_ACCESS_TOKEN = $null
  TF_VAR_access_token = $null
  CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT = $null
  CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE = $null
  CLOUDSDK_AUTH_ACCESS_TOKEN = $null
  CLOUDSDK_AUTH_ACCESS_TOKEN_FILE = $null
  CLOUDSDK_CORE_LOG_HTTP = 'false'
  CLOUDSDK_CORE_VERBOSITY = 'error'
}
# Do not allow inherited Terraform CLI arguments to replace the explicit
# target, backend, or reviewed plan arguments selected by this launcher.
foreach ($environmentKey in [Environment]::GetEnvironmentVariables('Process').Keys) {
  if ($environmentKey -like 'TF_CLI_ARGS*') { $overrides[$environmentKey] = $null }
}
$cloudFlags = @(('--configuration=' + $context.gcloudConfiguration), ('--account=' + $context.account), ('--project=' + $context.backendProjectId), '--quiet')
$token = ''
function File-Digest([string]$FilePath) {
  $FilePath = Assert-PrivatePath -Path $FilePath -RepositoryRoot $repoRoot -Kind File -AllowMissing
  if (-not (Test-Path -LiteralPath $FilePath)) { return 'absent' }
  $digest = [Security.Cryptography.SHA256]::Create()
  try { return [Convert]::ToBase64String($digest.ComputeHash([IO.File]::ReadAllBytes($FilePath))) }
  finally { $digest.Dispose() }
}
function Safe-Output([object[]]$Lines) {
  $text = $Lines -join [Environment]::NewLine
  if ($token) { $text = $text.Replace($token, '[redacted access token]') }
  $text = $text -replace 'AIza[A-Za-z0-9_-]{25,}', '[redacted API key]'
  $text = $text -replace '(?i)("(?:keyString|apiKey|access_token)"\s*:\s*")[^"]+', '$1[redacted]'
  Write-Output $text
}
function Terraform-Run([string[]]$Arguments) {
  Assert-Private-Terraform-Paths
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & $terraform ('-chdir=' + $workRoot) @Arguments 2>&1
    $result = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousErrorAction }
  Safe-Output $output
  if ($result -ne 0) { throw 'Terraform did not complete successfully. No credential values have been logged.' }
}
function Assert-Private-Terraform-Paths {
  $null = Assert-PrivatePath -Path $privateTerraform -RepositoryRoot $repoRoot -Kind Directory
  $lockPath = Join-Path $privateTerraform ('.' + [IO.Path]::GetFileName($statePath) + '.lock.info')
  foreach ($artifact in @($statePath, ($statePath + '.backup'), $lockPath, $planPath, $planContextPath)) {
    $null = Assert-PrivatePath -Path $artifact -RepositoryRoot $repoRoot -Kind File -AllowMissing
  }
}
function Same-Path([string]$Left, [string]$Right) {
  if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) { return $false }
  return [IO.Path]::GetFullPath($Left).Equals([IO.Path]::GetFullPath($Right), [StringComparison]::OrdinalIgnoreCase)
}
function Assert-Backend-Target {
  Assert-Private-Terraform-Paths
  $backendCachePath = Join-Path $overrides.TF_DATA_DIR 'terraform.tfstate'
  if (-not (Test-Path -LiteralPath $backendCachePath)) { throw 'Initialize Terraform with this private state directory before planning or applying.' }
  try { $backendMetadata = Get-Content -LiteralPath $backendCachePath -Raw | ConvertFrom-Json }
  catch { throw 'The local Terraform backend metadata could not be verified.' }
  if ($backendMetadata.backend.type -ne 'local' -or -not (Same-Path $backendMetadata.backend.config.path $statePath)) {
    throw 'The cached Terraform backend does not match this private state directory. Initialize and review the intended backend before continuing.'
  }
}
function Read-Plan-Json {
  $null = Assert-PrivatePath -Path $planPath -RepositoryRoot $repoRoot -Kind File
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $rawPlan = & $terraform ('-chdir=' + $workRoot) show -json $planPath 2>&1
    $result = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousErrorAction }
  if ($result -ne 0) { throw 'The saved plan could not be inspected safely. Regenerate it with this launcher.' }
  try { return ($rawPlan -join [Environment]::NewLine) | ConvertFrom-Json }
  catch { throw 'The saved plan returned invalid inspection data. No plan payload was displayed.' }
}
function Assert-Plan-Project([object]$Plan) {
  if ($Plan.variables.project_id.value -ne $context.backendProjectId -or $Plan.variables.provision_gemini.value -ne $true -or [bool]$Plan.variables.enable_vertex_ai.value -ne $enableVertexAi) {
    throw 'The saved plan targets a different project or provisioning mode. Regenerate and review it for the authorized configuration.'
  }
}
function Save-Plan-Context([string]$Kind) {
  $plan = Read-Plan-Json
  Assert-Plan-Project $plan
  if ($Kind -eq 'bootstrap') {
    foreach ($change in $plan.resource_changes) {
      if (@($change.change.actions | Where-Object { $_ -ne 'no-op' }).Count -gt 0 -and
          ($change.address -ne 'google_project_service.resource_manager[0]' -or @($change.change.actions).Count -ne 1 -or $change.change.actions[0] -ne 'create')) {
        throw 'The bootstrap plan may only create the verified Resource Manager API prerequisite.'
      }
    }
  }
  $planContext = [ordered]@{
    projectId = $context.backendProjectId
    account = $context.account
    configuration = $context.gcloudConfiguration
    enableVertexAi = $enableVertexAi
    statePath = [IO.Path]::GetFullPath($statePath)
    terraformRoot = [IO.Path]::GetFullPath($workRoot)
    planDigest = File-Digest $planPath
    kind = $Kind
  }
  Write-PrivateUtf8Text -Path $planContextPath -RepositoryRoot $repoRoot -Text (($planContext | ConvertTo-Json) + [Environment]::NewLine)
}
function Assert-Saved-Plan {
  Assert-Private-Terraform-Paths
  if (-not (Test-Path -LiteralPath $planPath) -or -not (Test-Path -LiteralPath $planContextPath)) { throw 'Generate and review a fresh plan with this launcher before applying.' }
  try { $planContext = Get-Content -LiteralPath $planContextPath -Raw | ConvertFrom-Json }
  catch { throw 'The saved plan context could not be verified. Generate a fresh plan.' }
  if ($planContext.projectId -ne $context.backendProjectId -or $planContext.account -ne $context.account -or
      $planContext.configuration -ne $context.gcloudConfiguration -or [bool]$planContext.enableVertexAi -ne $enableVertexAi -or -not (Same-Path $planContext.statePath $statePath) -or
      -not (Same-Path $planContext.terraformRoot $workRoot) -or $planContext.planDigest -ne (File-Digest $planPath)) {
    throw 'The saved plan does not match this profile, project, state directory, or reviewed file. Regenerate and review it.'
  }
  Assert-Plan-Project (Read-Plan-Json)
}
try {
  foreach ($key in $overrides.Keys) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
  }
  if ($Action -ne 'init') { Assert-Backend-Target }
  $configDirectory = ((& gcloud @cloudFlags info '--format=value(config.paths.global_config_dir)' 2>$null) -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or -not $configDirectory) { throw 'Could not locate shared ADC for an unchanged-file check.' }
  $configDirectory = Assert-PrivatePath -Path $configDirectory -RepositoryRoot $repoRoot -Kind Directory
  $adcPath = Assert-PrivatePath -Path (Join-Path $configDirectory 'application_default_credentials.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing
  $adcBefore = File-Digest $adcPath
  $profileOutput = & gcloud @cloudFlags config list --format=json 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the authorized cloud profile.' }
  $profile = ($profileOutput -join '') | ConvertFrom-Json
  if ($profile.core.account -ne $context.account -or $profile.core.project -ne $context.backendProjectId -or $profile.auth.impersonate_service_account -or $profile.auth.credential_file_override -or $profile.auth.access_token_file) {
    throw 'The explicit cloud profile does not match private authorization.'
  }
  $token = ((& gcloud @cloudFlags auth print-access-token 2>$null) -join '').Trim()
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Could not obtain a short-lived token from the verified profile.' }
  $env:GOOGLE_OAUTH_ACCESS_TOKEN = $token
  $env:TF_VAR_access_token = $token
  Write-Output 'Verified the explicit profile/account/project. Terraform uses a short-lived token; shared ADC is not used.'
  switch ($Action) {
    'init' {
      Terraform-Run @('init', '-input=false', '-no-color', ('-backend-config=path=' + $statePath))
      Assert-Backend-Target
    }
    'plan' {
      Terraform-Run @('plan', '-input=false', '-no-color', ('-out=' + $planPath))
      Save-Plan-Context 'full'
      Write-Output 'Saved the reviewable plan outside the public checkout.'
    }
    'bootstrap-plan' {
      # Recovery only: service refresh requires this already-discovered missing
      # API. A full plan/check is mandatory after the reviewed bootstrap apply.
      Terraform-Run @('plan', '-input=false', '-no-color', '-target=google_project_service.resource_manager[0]', ('-out=' + $planPath))
      Save-Plan-Context 'bootstrap'
      Write-Output 'Saved only the Resource Manager API bootstrap plan. Review it, apply, then run a full plan.'
    }
    'apply' {
      Assert-Saved-Plan
      # Apply only the previously generated plan; never make a fresh implicit plan.
      Terraform-Run @('apply', '-input=false', '-no-color', $planPath)
    }
    'repair-api-state' {
      # A failed post-create read can taint an already enabled API. Verify the
      # actual services before clearing only those two failed-create markers.
      $enabled = @(& gcloud @cloudFlags services list --enabled '--format=value(config.name)' 2>$null)
      if ($LASTEXITCODE -ne 0 -or $enabled -notcontains 'apikeys.googleapis.com' -or $enabled -notcontains 'generativelanguage.googleapis.com' -or $enabled -notcontains 'cloudresourcemanager.googleapis.com') {
        throw 'All three required APIs must be verified enabled before repairing failed-create state.'
      }
      # PowerShell 5.1 native argument passing requires escaped quotes inside
      # Terraform for_each resource addresses.
      Terraform-Run @('untaint', '-no-color', 'google_project_service.gemini[\"apikeys.googleapis.com\"]')
      Terraform-Run @('untaint', '-no-color', 'google_project_service.gemini[\"generativelanguage.googleapis.com\"]')
    }
    'check' {
      Assert-Private-Terraform-Paths
      $previousErrorAction = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        $output = & $terraform ('-chdir=' + $workRoot) plan -input=false -no-color -detailed-exitcode 2>&1
        $result = $LASTEXITCODE
      } finally { $ErrorActionPreference = $previousErrorAction }
      Safe-Output $output
      if ($result -ne 0) { throw 'Terraform did not report a clean, unchanged plan.' }
    }
  }
} finally {
  foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
  $token = ''
  if ($adcPath -and $adcBefore) {
    $adcAfter = File-Digest $adcPath
    if ($adcAfter -ne $adcBefore) { throw 'Shared ADC changed during this operation; investigate before continuing.' }
    Write-Output 'Shared ADC unchanged (SHA256 comparison).'
  }
}
