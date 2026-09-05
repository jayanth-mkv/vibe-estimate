$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $repoRoot 'scripts/private-path.ps1')
$launcherPath = Join-Path $repoRoot 'scripts/terraform-gemini.ps1'
$configurationPath = Join-Path $repoRoot 'scripts/configure-gemini.ps1'
$functionNames = @('File-Digest', 'Same-Path', 'Assert-Private-Terraform-Paths', 'Assert-Backend-Target', 'Assert-Plan-Project', 'Save-Plan-Context', 'Assert-Saved-Plan')
foreach ($sourcePath in @($launcherPath, $configurationPath)) {
  $parserTokens = $null
  $parserErrors = $null
  $syntax = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$parserTokens, [ref]$parserErrors)
  if ($parserErrors.Count -gt 0) { throw 'A Gemini PowerShell script has parse errors.' }
  if ($sourcePath -eq $launcherPath) {
    # Load only pure guard functions. Never execute the launcher or cloud CLI.
    foreach ($function in $syntax.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
      if ($functionNames -contains $function.Name) { . ([scriptblock]::Create($function.Extent.Text)) }
    }
  }
}
$fixtureRoot = Join-Path $repoRoot '.cache/gemini-launcher-guards'
$privateTerraform = Join-Path $fixtureRoot 'private-fixture'
$statePath = Join-Path $privateTerraform 'state.tfstate'
$workRoot = Join-Path $fixtureRoot 'module-fixture'
$planPath = Join-Path $privateTerraform 'fixture.tfplan'
$planContextPath = Join-Path $privateTerraform 'fixture.plan-context.json'
$overrides = @{ TF_DATA_DIR = (Join-Path $fixtureRoot 'data') }
New-Item -ItemType Directory -Force -Path $overrides.TF_DATA_DIR, $privateTerraform, $workRoot | Out-Null
# This test uses only fake metadata in ignored cache. Model the repository as
# the empty fixture module, with synthetic private artifacts beside it.
$repoRoot = $workRoot
$context = [pscustomobject]@{ backendProjectId = 'example-authorized-project'; account = 'operator@example.invalid'; gcloudConfiguration = 'fixture-profile' }
$enableVertexAi = $false
$fixturePlan = [pscustomobject]@{
  variables = [pscustomobject]@{ project_id = [pscustomobject]@{ value = $context.backendProjectId }; provision_gemini = [pscustomobject]@{ value = $true }; enable_vertex_ai = [pscustomobject]@{ value = $false } }
  resource_changes = @([pscustomobject]@{ address = 'google_project_service.resource_manager[0]'; change = [pscustomobject]@{ actions = @('create') } })
}
function Read-Plan-Json { return $fixturePlan }
function Expect-Rejection([scriptblock]$Check) {
  $rejected = $false
  try { & $Check } catch { $rejected = $true }
  if (-not $rejected) { throw 'A launcher target guard accepted mismatched fixture input.' }
}
$backendMetadata = @{ backend = @{ type = 'local'; config = @{ path = $statePath } } }
Set-Content -LiteralPath (Join-Path $overrides.TF_DATA_DIR 'terraform.tfstate') -Value ($backendMetadata | ConvertTo-Json -Depth 4)
Set-Content -LiteralPath $planPath -Value 'fake plan, no cloud resources or credentials'
Assert-Backend-Target
Save-Plan-Context 'bootstrap'
Assert-Saved-Plan
$enableVertexAi = $true
Expect-Rejection { Assert-Saved-Plan }
Expect-Rejection { Assert-Plan-Project $fixturePlan }
$fixturePlan.variables.enable_vertex_ai.value = $true
Save-Plan-Context 'full'
Assert-Saved-Plan
$enableVertexAi = $false
Expect-Rejection { Assert-Saved-Plan }
$fixturePlan.variables.enable_vertex_ai.value = $false
Save-Plan-Context 'bootstrap'
$context.backendProjectId = 'example-different-project'
Expect-Rejection { Assert-Saved-Plan }
Expect-Rejection { Assert-Plan-Project $fixturePlan }
$context.backendProjectId = 'example-authorized-project'
$originalStatePath = $statePath
$statePath = Join-Path $fixtureRoot 'different-private-fixture/state.tfstate'
Expect-Rejection { Assert-Backend-Target }
Expect-Rejection { Assert-Saved-Plan }
$statePath = $originalStatePath
Add-Content -LiteralPath $planPath -Value 'modified after review'
Expect-Rejection { Assert-Saved-Plan }
$fixturePlan.resource_changes[0].address = 'restful_resource.gemini_key[0]'
Expect-Rejection { Save-Plan-Context 'bootstrap' }
Write-Output 'Gemini launchers parse. Guard tests passed: matching target accepted; changed project, backend, Vertex opt-in, plan digest, and out-of-scope bootstrap rejected. No cloud calls.'
