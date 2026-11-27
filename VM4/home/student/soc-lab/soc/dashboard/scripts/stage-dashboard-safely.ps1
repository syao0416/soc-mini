param([switch]$Stage)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $root '..\..')).Path
Set-Location $repo
$branch = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feature/dashboard') { throw 'Expected feature/dashboard branch. Nothing staged.' }
# Refuse an already tracked .env, even if Git ignores it today.
$trackedEnv = @(git ls-files -- dashboard/.env)
if ($trackedEnv.Count -gt 0) { throw 'dashboard/.env is already tracked. Stop before staging/pushing.' }
$ignore = Join-Path $repo 'dashboard\.gitignore'
if (-not (Test-Path $ignore)) { throw 'Missing dashboard/.gitignore. Verify secrets handling first.' }
Write-Host 'Current changes:'
git status --short -- dashboard
Write-Host 'All dashboard files will be kept, including same-named files in different folders, except ignored sensitive data.'
Write-Host 'Root .vscode/ and other team folders will not be staged.'
if (-not $Stage) { Write-Host 'DRY-RUN ONLY: run scripts\stage-dashboard-safely.ps1 -Stage to stage dashboard files.'; exit 0 }
git add -A -- dashboard
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
$staged = @(git diff --cached --name-only -- dashboard)
$bad = @($staged | Where-Object { $_ -match '(?i)(^|/)(\.env($|\.)|local-data/|local-backups/|node_modules/|__pycache__/)|\.(?:pem|key|p12|pfx|sqlite3?|sql|sql\.gz)$' })
if ($bad.Count -gt 0) {
    Write-Warning 'Potentially sensitive files were staged; they will be UNSTAGED now.'
    foreach ($item in $bad) { git restore --staged -- "$item"; Write-Host "Unstaged: $item" }
    throw 'Sensitive files detected. Review .gitignore and try again.'
}
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace/conflict check failed. Do not commit until fixed.' }
Write-Host 'Staged dashboard files:'
git diff --cached --name-only -- dashboard
Write-Host 'NOTE: content-level secret scan is still required. Review git diff --cached before commit.'
Write-Host 'No commit or push was performed.'
