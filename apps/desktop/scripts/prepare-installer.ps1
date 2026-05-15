$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopRoot = Resolve-Path (Join-Path $scriptDir '..')
$staleDependencyPath = Join-Path $desktopRoot 'node_modules\@thesusheer\electron-printer'

if (Test-Path $staleDependencyPath) {
  $staleDependency = Get-Item -LiteralPath $staleDependencyPath
  $targetPath = $staleDependency.Target | Select-Object -First 1

  if ($staleDependency.LinkType -eq 'Junction' -and $targetPath -and -not (Test-Path $targetPath)) {
    Remove-Item -LiteralPath $staleDependencyPath -Force
    Write-Host "Removed stale dependency junction at $staleDependencyPath"
  }
}

& (Join-Path $scriptDir 'generate-icons.ps1')
