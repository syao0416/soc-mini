# VIOLET SOC - additive visual analytics. Does not change authentication, Django, or DB.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root 'src\monitoring\LivePages.tsx'
$component = Join-Path $root 'src\monitoring\ReputationVisuals.tsx'
$stylesheet = Join-Path $root 'src\monitoring\reputation-visuals.css'
$map = Join-Path $root 'public\soc-world.svg'

foreach ($file in @($target,$component,$stylesheet,$map)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing file: $file. Extract the entire ZIP into C:\soc-mini\dashboard and try again."
  }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$source = [System.IO.File]::ReadAllText($target, [System.Text.Encoding]::UTF8)
if ($source.Contains('<ReputationVisuals ')) {
  Write-Host 'Already installed: IP visualization component is referenced in LivePages.tsx.' -ForegroundColor Yellow
  exit 0
}

$start = $source.IndexOf('export function LiveReputation(')
if ($start -lt 0) { throw 'Could not find LiveReputation in LivePages.tsx. No files were changed.' }
$end = $source.IndexOf('function downloadMarkdown(', $start)
if ($end -lt 0) { throw 'Could not find the expected end of LiveReputation. No files were changed.' }
$section = $source.Substring($start, $end - $start)
if (-not $section.Contains('const {rows') -or -not $section.Contains('checked')) {
  throw 'LiveReputation differs from the supported version. No files were changed. Please show me the function source.'
}
$close = $section.LastIndexOf('</>')
if ($close -lt 0) { throw 'LiveReputation has a different JSX structure. No files were changed.' }
$insertion = "`n      <ReputationVisuals events={rows} selectedIp={checked} capped={capped} onOpenAlerts={() => goTo('alerts')} />`n    "
$section = $section.Insert($close, $insertion)
$newSource = $source.Substring(0,$start) + $section + $source.Substring($end)
$importLine = "import { ReputationVisuals } from './ReputationVisuals'"
if (-not $newSource.Contains($importLine)) {
  $newSource = $importLine + "`n" + $newSource
}
$backupFolder = Join-Path $root ('local-backups\ip-visuals-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
Copy-Item -LiteralPath $target -Destination (Join-Path $backupFolder 'LivePages.tsx')
[System.IO.File]::WriteAllText($target, $newSource, $utf8)
Write-Host 'Installed: additional IP analytics section beneath the existing search UI.' -ForegroundColor Green
Write-Host "Backup: $backupFolder" -ForegroundColor Cyan
Write-Host 'Next: npm.cmd run build' -ForegroundColor Cyan
