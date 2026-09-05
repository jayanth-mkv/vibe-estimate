$ErrorActionPreference = 'Stop'
$checkoutRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$helperPath = Join-Path $checkoutRoot 'scripts/private-path.ps1'
. $helperPath
$scriptPaths = @(
  $helperPath,
  (Join-Path $checkoutRoot 'scripts/configure-gemini.ps1'),
  (Join-Path $checkoutRoot 'scripts/configure-vertex.ps1'),
  (Join-Path $checkoutRoot 'scripts/terraform-gemini.ps1')
)
foreach ($sourcePath in $scriptPaths) {
  $parserTokens = $null
  $parserErrors = $null
  $syntax = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$parserTokens, [ref]$parserErrors)
  if ($parserErrors.Count -gt 0) { throw 'A private-path helper or launcher has parse errors.' }
  foreach ($function in $syntax.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    if ($function.Name -eq 'Assert-Private-Terraform-Paths') { . ([scriptblock]::Create($function.Extent.Text)) }
  }
}

# Every file here is synthetic. The public/private boundary is an empty test
# repository beside fake private files; no operator directory is accessed.
$cacheRoot = Get-UnlinkedFileSystemPath -Path (Join-Path $checkoutRoot '.cache') -Kind Directory
$fixtureRoot = Join-Path $cacheRoot ('private-path-guards-' + [Guid]::NewGuid().ToString('N'))
$repoRoot = Join-Path $fixtureRoot 'public'
$privateRoot = Join-Path $fixtureRoot 'private'
$privateTerraform = Join-Path $privateRoot 'terraform'
New-Item -ItemType Directory -Path $fixtureRoot, $repoRoot, $privateRoot, $privateTerraform | Out-Null
$statePath = Join-Path $privateTerraform 'gemini.tfstate'
$planPath = Join-Path $privateTerraform 'gemini.tfplan'
$planContextPath = Join-Path $privateTerraform 'gemini.plan-context.json'
$sentinelPath = Join-Path $repoRoot 'sentinel.txt'
[IO.File]::WriteAllText($sentinelPath, 'synthetic public sentinel')
$linkPaths = New-Object 'System.Collections.Generic.List[string]'
$filePaths = New-Object 'System.Collections.Generic.List[string]'
$filePaths.Add($sentinelPath)
$checks = 0
$fileSymlinkAvailable = $false

function Expect-PrivateRejection([scriptblock]$Check) {
  $rejected = $false
  try { & $Check | Out-Null }
  catch {
    $rejected = $true
    if ($_.Exception.Message -notmatch 'Private paths|outside the public checkout') { throw 'A path check failed for an unexpected reason.' }
  }
  if (-not $rejected) { throw 'A private-path guard accepted an unsafe synthetic path.' }
}

try {
  $ordinary = Join-Path $privateRoot 'ordinary.json'
  $filePaths.Add($ordinary)
  Write-PrivateUtf8Text -Path $ordinary -RepositoryRoot $repoRoot -Text '{"synthetic":true}'
  if ([IO.File]::ReadAllText($ordinary) -ne '{"synthetic":true}') { throw 'An ordinary private destination was not written correctly.' }
  $null = Assert-PrivatePath -Path $ordinary -RepositoryRoot $repoRoot -Kind File
  $checks++

  Expect-PrivateRejection { Assert-PrivatePath -Path $repoRoot -RepositoryRoot ($repoRoot + [IO.Path]::DirectorySeparatorChar) -Kind Directory }
  Expect-PrivateRejection { Write-PrivateUtf8Text -Path $sentinelPath -RepositoryRoot $repoRoot -Text 'must never be written' }
  Expect-PrivateRejection { Assert-PrivatePath -Path (Join-Path $privateRoot '../public/new.json') -RepositoryRoot $repoRoot -Kind File -AllowMissing }
  $checks++

  $rootLink = Join-Path $privateRoot 'linked-root'
  New-Item -ItemType Junction -Path $rootLink -Target $repoRoot | Out-Null
  $linkPaths.Add($rootLink)
  Expect-PrivateRejection { Assert-PrivatePath -Path $rootLink -RepositoryRoot $repoRoot -Kind Directory }
  Expect-PrivateRejection { Write-PrivateUtf8Text -Path (Join-Path $rootLink 'new.json') -RepositoryRoot $repoRoot -Text 'must never be written' }
  $checks++

  # A directory junction can also occupy the exact final destination name.
  # Test every private writer input/output, including implicit Terraform files.
  foreach ($destination in @(
    (Join-Path $privateRoot 'local-config.json'),
    (Join-Path $privateRoot 'gemini-local.json'),
    (Join-Path $privateRoot 'vertex-local.json'),
    $statePath, ($statePath + '.backup'),
    (Join-Path $privateTerraform '.gemini.tfstate.lock.info'), $planPath, $planContextPath
  )) {
    New-Item -ItemType Junction -Path $destination -Target $repoRoot | Out-Null
    $linkPaths.Add($destination)
    Expect-PrivateRejection { Assert-PrivatePath -Path $destination -RepositoryRoot $repoRoot -Kind File -AllowMissing }
    Expect-PrivateRejection { Write-PrivateUtf8Text -Path $destination -RepositoryRoot $repoRoot -Text 'must never be written' }
    if ([IO.Path]::GetDirectoryName($destination) -eq $privateTerraform) { Expect-PrivateRejection { Assert-Private-Terraform-Paths } }
    [IO.Directory]::Delete($destination)
    $null = $linkPaths.Remove($destination)
    $checks++
  }

  # Exercise a file symlink too when Windows grants this local privilege.
  $fileLink = Join-Path $privateRoot 'linked-file.json'
  try {
    New-Item -ItemType SymbolicLink -Path $fileLink -Target $sentinelPath -ErrorAction Stop | Out-Null
    $fileSymlinkAvailable = $true
    $linkPaths.Add($fileLink)
  } catch {
    if ($_.Exception.Message -notmatch 'privilege|privileges|permission|administrator|access.*denied') { throw }
  }
  if ($fileSymlinkAvailable) {
    Expect-PrivateRejection { Write-PrivateUtf8Text -Path $fileLink -RepositoryRoot $repoRoot -Text 'must never be written' }
    $checks++
  }

  Assert-Private-Terraform-Paths
  $checks++
  if ([IO.File]::ReadAllText($sentinelPath) -ne 'synthetic public sentinel' -or [IO.File]::Exists((Join-Path $repoRoot 'new.json'))) { throw 'A rejected path modified the synthetic public repository.' }
  Write-Output ('Private path guards passed: ' + $checks + ' cases; all three launchers parsed; no cloud calls or operator credentials accessed.')
  if (-not $fileSymlinkAvailable) { Write-Output 'File symlink creation lacked OS privilege; equivalent final-destination junction checks passed for every artifact.' }
} finally {
  # Delete only exact entries created above, unlinking reparse points without
  # recursion. Never traverse a junction while cleaning up the fixture.
  foreach ($linkPath in $linkPaths) {
    $attributes = [IO.File]::GetAttributes($linkPath)
    if (($attributes -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::Delete($linkPath) }
    else { [IO.File]::Delete($linkPath) }
  }
  foreach ($filePath in $filePaths) { [IO.File]::Delete($filePath) }
  foreach ($directory in @($privateTerraform, $privateRoot, $repoRoot, $fixtureRoot)) { [IO.Directory]::Delete($directory) }
}
