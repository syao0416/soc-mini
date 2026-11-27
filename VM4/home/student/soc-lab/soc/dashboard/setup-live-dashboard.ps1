# Integrate real MariaDB events into the existing Violet SOC navigation without replacing the shell/auth UI.
# Use from C:\soc-mini\dashboard after extracting this ZIP into that folder.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appPath = Join-Path $root 'src\App.tsx'
$viewsPath = Join-Path $root 'backend\monitoring\views.py'
$newPage = Join-Path $root 'src\monitoring\LivePages.tsx'
$newApi = Join-Path $root 'src\monitoring\liveApi.ts'
foreach ($file in @($appPath,$viewsPath,$newPage,$newApi)) {
  if (!(Test-Path $file)) {throw "Required file missing: $file`nExtract the addon ZIP into C:\soc-mini\dashboard first."}
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
$app = [IO.File]::ReadAllText($appPath,[Text.Encoding]::UTF8)
$views = [IO.File]::ReadAllText($viewsPath,[Text.Encoding]::UTF8)
$installed = $app.Contains("from './monitoring/LivePages'")
if (-not $installed) {
  $startToken = "{page==='dashboard'&&<>"
  $endToken = '<footer className="footer">'
  $start = $app.IndexOf($startToken,[StringComparison]::Ordinal)
  $end = if ($start -ge 0) {$app.IndexOf($endToken,$start,[StringComparison]::Ordinal)} else {-1}
  if ($start -lt 0 -or $end -lt 0 -or $app.Substring($start, ($end - $start)).IndexOf("{page==='settings'&&<>") -lt 0) {
    throw 'Existing App.tsx layout is different from the expected Violet SOC version. Stopped without modifying files. Send the App.tsx file for a custom patch.'
  }
}
$needle = "        'review_status': review.status if review else EventReview.Status.NEW,"
if (-not $views.Contains("'review_note':")) {
  if (-not $views.Contains($needle)) {throw 'Expected event_item function not found in monitoring/views.py. Stopped without modifying files.'}
  $views = $views.Replace($needle, $needle + "`n        'review_note': review.note if review else '',")
}
$views = $views.Replace('if not request.user.is_staff:', 'if not request.user.is_superuser:')
$backupDir = Join-Path $root 'local-backups'
New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $appPath (Join-Path $backupDir "App-before-live-$stamp.tsx")
Copy-Item $viewsPath (Join-Path $backupDir "monitoring-views-before-live-$stamp.py")
if (-not $installed) {
  $newScreens = @'
{page==='dashboard' && <LiveDashboard goTo={selectPage}/>}
      {page==='alerts' && <LiveAlerts/>}
      {page==='logs' && <LiveLogs/>}
      {page==='monitoring' && <LiveMonitoring/>}
      {page==='responses' && <LiveResponses/>}
      {page==='reputation' && <LiveReputation goTo={selectPage}/>}
      {page==='reports' && <LiveReports/>}
      {page==='settings' && <LiveSettings/>}
      
'@
  $app = $app.Substring(0,$start) + $newScreens + $app.Substring($end)
  $import = "import { LiveDashboard, LiveAlerts, LiveLogs, LiveMonitoring, LiveResponses, LiveReputation, LiveReports, LiveSettings } from './monitoring/LivePages'`n"
  $app = $import + $app
}
# Correct misleading demo labels and remove a notification counter based on old mock data.
$app = $app.Replace('DEMO MODE <small>실제 장비·메일·차단 미연동</small>', 'SNAPSHOT MODE <small>로컬 DB · 실시간 미연동</small>')
$app = $app.Replace('DEMO DATA</span>', 'DB SNAPSHOT</span>')
$app = $app.Replace('<Bell size={20}/>{newCount>0&&<em>{newCount}</em>}', '<Bell size={20}/>')
$app = $app.Replace('DESIGN SYSTEM / PURPLE GLASS · FRONTEND DEMO', 'DESIGN SYSTEM / PURPLE GLASS · DATABASE SNAPSHOT')
[IO.File]::WriteAllText($appPath,$app,$utf8)
[IO.File]::WriteAllText($viewsPath,$views,$utf8)
# Test screen should also reopen saved notes.
$testPath = Join-Path $root 'src\monitoring\SocEvents.tsx'
if (Test-Path $testPath) {
  $test = [IO.File]::ReadAllText($testPath,[Text.Encoding]::UTF8)
  if ($test.Contains("setNote('')")) {
    $test = $test.Replace("setNote('')", "setNote(detail.review_note ?? '')")
    $test = $test.Replace('review_status: ReviewStatus', 'review_status: ReviewStatus; review_note?: string')
    [IO.File]::WriteAllText($testPath,$test,$utf8)
  }
}
$gitignorePath = Join-Path $root '.gitignore'
if (!(Test-Path $gitignorePath)) {[IO.File]::WriteAllText($gitignorePath,'',$utf8)}
$ignore = [IO.File]::ReadAllText($gitignorePath,[Text.Encoding]::UTF8)
if ($ignore -notmatch '(?m)^local-backups/\s*$') {
  $ignore += "`nlocal-backups/`n"
  [IO.File]::WriteAllText($gitignorePath,$ignore,$utf8)
}
Write-Host 'OK: Real SOC pages wired into existing Violet SOC App.tsx.'
Write-Host 'OK: Saved review notes now included in event detail API.'
Write-Host 'OK: Review request decisions require Django superuser.'
Write-Host "Backups: $backupDir (ignored by Git)."
Write-Host 'NEXT: docker compose restart api'
Write-Host 'NEXT: npm.cmd run build'
Write-Host 'NEXT: npm.cmd run dev, open http://localhost:5173/'
