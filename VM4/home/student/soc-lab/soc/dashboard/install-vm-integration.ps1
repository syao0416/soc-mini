# Non-destructive, UTF-8 installer. Run from the dashboard root after extracting all files.
# It never touches credentials, the DB, network interfaces, or the firewall.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = [System.Text.UTF8Encoding]::new($false)
$modelsPath = Join-Path $root 'backend\operations\models.py'
$viewsPath = Join-Path $root 'backend\monitoring\views.py'
$livePath = Join-Path $root 'src\monitoring\LivePages.tsx'
$srcPath = Join-Path $root 'vm2-integration-source'
$srcCommandPath = Join-Path $srcPath 'backend\operations\management\commands'
$srcMigrationPath = Join-Path $srcPath 'backend\operations\migrations'
$required = @($modelsPath, $viewsPath, $livePath,
    (Join-Path $srcCommandPath 'probe_soc_logs.py'),
    (Join-Path $srcCommandPath 'export_vm2_approval.py'),
    (Join-Path $srcCommandPath 'import_vm2_receipt.py'),
    (Join-Path $srcMigrationPath '0002_firewallreceipt.py'))
foreach ($p in $required) { if (-not (Test-Path -LiteralPath $p)) { throw "Missing file: $p. Please extract ZIP as described in README." } }
$models = [IO.File]::ReadAllText($modelsPath, [Text.Encoding]::UTF8)
$views = [IO.File]::ReadAllText($viewsPath, [Text.Encoding]::UTF8)
if (-not $views.Contains("'executed': False" ) -and -not $views.Contains("'execution_result':")) { throw 'Unexpected monitoring/views.py. No files changed.' }
if (-not $models.Contains('class SettingsAudit(')) { throw 'Operations app is missing. No files changed.' }
$destCommandPath = Join-Path $root 'backend\operations\management\commands'
$destMigrationPath = Join-Path $root 'backend\operations\migrations'
$files = @(
    @((Join-Path $srcCommandPath 'probe_soc_logs.py'), (Join-Path $destCommandPath 'probe_soc_logs.py')),
    @((Join-Path $srcCommandPath 'export_vm2_approval.py'), (Join-Path $destCommandPath 'export_vm2_approval.py')),
    @((Join-Path $srcCommandPath 'import_vm2_receipt.py'), (Join-Path $destCommandPath 'import_vm2_receipt.py')),
    @((Join-Path $srcMigrationPath '0002_firewallreceipt.py'), (Join-Path $destMigrationPath '0002_firewallreceipt.py'))
)
foreach ($entry in $files) {
    if ((Test-Path -LiteralPath $entry[1]) -and ((Get-FileHash -LiteralPath $entry[0]).Hash -ne (Get-FileHash -LiteralPath $entry[1]).Hash)) {
        throw "Existing customized file differs: $($entry[1]). No files changed."
    }
}
$backup = Join-Path $root 'local-backups'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
Copy-Item $modelsPath (Join-Path $backup "operations-models-before-vm-$stamp.bak")
Copy-Item $viewsPath (Join-Path $backup "monitoring-views-before-vm-$stamp.bak")
Copy-Item $livePath (Join-Path $backup "livepages-before-vm-$stamp.bak")
if (-not $models.Contains('class FirewallExecutionReceipt(')) {
    $models += @'


class FirewallExecutionReceipt(models.Model):
    """Verified record of a manually executed VM2 command in the Django DB."""
    response = models.OneToOneField('monitoring.ResponseRequest', on_delete=models.PROTECT, related_name='firewall_receipt')
    action = models.CharField(max_length=10)
    target_ip = models.GenericIPAddressField(protocol='IPv4')
    result = models.CharField(max_length=32)
    executed_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
'@
    [IO.File]::WriteAllText($modelsPath, $models.TrimEnd() + "`n", $enc)
}
if (-not $views.Contains("'execution_result':")) {
    $needle = "'executed': False,  # approval is recorded, NEVER executes a firewall command"
    if (-not $views.Contains($needle)) { throw 'Cannot find expected response serialization text; restore backup if necessary.' }
    $views = [regex]::Replace($views, "def response_item\(record\):\r?\n    return \{", "def response_item(record):`n    receipt = getattr(record, 'firewall_receipt', None)`n    return {")
    $views = $views.Replace($needle, "'executed': receipt is not None,`n        'execution_result': receipt.result if receipt else None,")
    [IO.File]::WriteAllText($viewsPath, $views, $enc)
}
foreach ($entry in $files) {
    New-Item -ItemType Directory -Force -Path (Split-Path $entry[1] -Parent) | Out-Null
    if (-not (Test-Path -LiteralPath $entry[1])) { Copy-Item -LiteralPath $entry[0] -Destination $entry[1] }
}
# Poll the existing event API every 15 seconds when the page is visible; optional, edit UI only for exact known source.
$live = [IO.File]::ReadAllText($livePath, [Text.Encoding]::UTF8)
if (-not $live.Contains('VIOLET SOC LIVE POLL')) {
    $anchor = '  return {rows,stats,responses,capped,error,loading,reload}'
    if ($live.Contains($anchor)) {
        $poll = @'
  // VIOLET SOC LIVE POLL: when the page is visible, refresh stats and event summaries.
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void reload() }, 15000)
    return () => window.clearInterval(timer)
  }, [reload])
'@
        $live = $live.Replace($anchor, ($poll + "`n" + $anchor))
        [IO.File]::WriteAllText($livePath, $live, $enc)
        Write-Host 'OK: Dashboard/Alert live poll every 15 seconds.'
    } else { Write-Warning 'LivePages has been customized: polling not inserted. APIs and VM commands were installed.' }
}
# Display imported execution receipts as verified VM2 action status, not mere approval.
$live = [IO.File]::ReadAllText($livePath, [Text.Encoding]::UTF8)
$oldStatus = '{responseLabel(r.status)} · 실제 실행 없음'
$newStatus = "{responseLabel(r.status)} · {r.executed ? 'VM2 실행 확인' : 'VM2 실행 미확인'}"
if ($live.Contains($oldStatus)) {
    $live = $live.Replace($oldStatus, $newStatus)
}
if ($live.Contains('실제 네트워크 차단이나 VM2 방화벽 변경은 실행되지 않아.')) {
    $live = $live.Replace('실제 네트워크 차단이나 VM2 방화벽 변경은 실행되지 않아.', 'VM2 방화벽 실행 여부는 서명된 실행 영수증을 가져온 후 확인할 수 있습니다.')
}
[IO.File]::WriteAllText($livePath, $live, $enc)
$ignorePath = Join-Path $root '.gitignore'
if (Test-Path $ignorePath) {
    $ignore = [IO.File]::ReadAllText($ignorePath, [Text.Encoding]::UTF8)
    $start = '# VIOLET SOC integration sensitive local files'
    if (-not $ignore.Contains($start)) {
        [IO.File]::AppendAllText($ignorePath, "`n$start`n.env`n.env.*`n!.env.example`n!.env.integration.example`nlocal-data/`nlocal-backups/`n*.pyc`n__pycache__/`n*.pem`n*.key`nvm2-agent/receipts/`n", $enc)
    }
}
Write-Host 'OK: VM integration commands installed with existing Operations module.'
Write-Host 'No VM firewall rule, DB data, or SMTP secret was changed.'
Write-Host 'NEXT: docker compose exec api python manage.py migrate'
Write-Host 'NEXT: docker compose exec api python manage.py probe_soc_logs'
Write-Host 'NEXT: npm.cmd run build'
