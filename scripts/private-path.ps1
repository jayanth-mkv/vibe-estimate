# Local path guards only. This helper never reads configuration contents or
# invokes a cloud command. Reject links rather than following their targets.
function Get-UnlinkedFileSystemPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet('Any', 'File', 'Directory')][string]$Kind = 'Any',
    [switch]$AllowMissing
  )

  try {
    $pathProvider = $null
    $pathDrive = $null
    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path, [ref]$pathProvider, [ref]$pathDrive)
    if ($pathProvider.Name -ne 'FileSystem') { throw 'Unsupported path provider.' }
    $resolved = [IO.Path]::GetFullPath($resolved)
    $volumeRoot = [IO.Path]::GetPathRoot($resolved)
    if ($resolved.Length -gt $volumeRoot.Length) { $resolved = $resolved.TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)) }
    $remainder = $resolved.Substring($volumeRoot.Length)
    $segments = @($remainder.Split([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringSplitOptions]::RemoveEmptyEntries))
    $current = $volumeRoot
    $exists = $true
    $attributes = [IO.File]::GetAttributes($current)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked root.' }
    foreach ($segment in $segments) {
      # Windows aliases with trailing dots/spaces must not bypass comparison.
      if ($segment.EndsWith('.') -or $segment.EndsWith(' ')) { throw 'Ambiguous path component.' }
      $current = [IO.Path]::Combine($current, $segment)
      if (-not $exists) { continue }
      try { $attributes = [IO.File]::GetAttributes($current) }
      catch [IO.FileNotFoundException] { $exists = $false; continue }
      catch [IO.DirectoryNotFoundException] { $exists = $false; continue }
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked path component.' }
    }
    if (-not $exists -and -not $AllowMissing) { throw 'Missing path.' }
    if ($exists) {
      $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
      if (($Kind -eq 'Directory' -and -not $isDirectory) -or ($Kind -eq 'File' -and $isDirectory)) { throw 'Incorrect path type.' }
    }
    return $resolved
  } catch {
    throw 'Private paths must use ordinary filesystem entries without symlinks, junctions, or other reparse points; path details omitted.'
  }
}

function Assert-PrivatePath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [ValidateSet('Any', 'File', 'Directory')][string]$Kind = 'Any',
    [switch]$AllowMissing
  )

  $repository = Get-UnlinkedFileSystemPath -Path $RepositoryRoot -Kind Directory
  $resolved = Get-UnlinkedFileSystemPath -Path $Path -Kind $Kind -AllowMissing:$AllowMissing
  $comparison = [StringComparison]::OrdinalIgnoreCase
  $boundary = $repository.TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)) + [IO.Path]::DirectorySeparatorChar
  if ($resolved.Equals($repository, $comparison) -or $resolved.StartsWith($boundary, $comparison)) {
    throw 'Private configuration, credentials, and Terraform artifacts must stay outside the public checkout.'
  }
  return $resolved
}

function Write-PrivateUtf8Text {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [Parameter(Mandatory = $true)][string]$Text
  )

  $destination = Assert-PrivatePath -Path $Path -RepositoryRoot $RepositoryRoot -Kind File -AllowMissing
  $null = Assert-PrivatePath -Path ([IO.Path]::GetDirectoryName($destination)) -RepositoryRoot $RepositoryRoot -Kind Directory
  try { [IO.File]::WriteAllText($destination, $Text, (New-Object Text.UTF8Encoding $false)) }
  catch { throw 'The private output could not be saved; its contents and path were not displayed.' }
}
