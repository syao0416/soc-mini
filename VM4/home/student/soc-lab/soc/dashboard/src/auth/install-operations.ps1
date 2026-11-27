# This installer edits only three existing text files (with backups):
# backend/config/settings.py, backend/config/urls.py, src/App.tsx.
# It does not change database contents, credentials, or user data.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$enc = [System.Text.UTF8Encoding]::new($false)
$settingsPath = Join-Path $root 'backend\config\settings.py'
$urlsPath = Join-Path $root 'backend\config\urls.py'
$appPath = Join-Path $root 'src\App.tsx'
$fragmentPath = Join-Path $root 'backend-operations-settings.fragment.py'
$files = @(
    $settingsPath, $urlsPath, $appPath, $fragmentPath,
    (Join-Path $root 'backend\operations\models.py'),
    (Join-Path $root 'backend\operations\urls.py'),
    (Join-Path $root 'src\monitoring\SocSettings.tsx'),
    (Join-Path $root 'src\monitoring\operationsApi.ts'),
    (Join-Path $root 'docker-compose.notifications.yml')
)
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Required file missing: $file. Extract the entire ZIP content into the dashboard root." }
}
$settings = [IO.File]::ReadAllText($settingsPath, [Text.Encoding]::UTF8)
$urls = [IO.File]::ReadAllText($urlsPath, [Text.Encoding]::UTF8)
$app = [IO.File]::ReadAllText($appPath, [Text.Encoding]::UTF8)
$marker = 'VIOLET SOC OPERATIONS CONFIG'
if (-not $settings.Contains($marker)) {
    if ($settings -notmatch '(?m)^import os\s*$') { throw 'Unexpected Django settings.py: import os not found. No files changed.' }
    if ($settings -notmatch "soc_logs") { throw 'Django soc_logs database alias not found. Run the events addon first. No files changed.' }
}
$hasSocSettings = [regex]::IsMatch($app, '(?m)^import\s+\{\s*SocSettings\s*\}\s+from\s+[''"]\./monitoring/SocSettings[''"]')
$hasOldScreen = [regex]::IsMatch($app, '<LiveSettings\s*/>')
$hasNewScreen = [regex]::IsMatch($app, '<SocSettings\s*/>')
if (-not $hasOldScreen -and -not $hasNewScreen) {
    throw 'Expected <LiveSettings/> navigation entry was not found in App.tsx. No files changed. Please provide App.tsx for a matching integration.'
}
if ($hasOldScreen -and -not [regex]::IsMatch($app, '(?m)^import\s+\{[^\n}]*\bLiveSettings\b[^\n}]*\}\s+from\s+[''"]\./monitoring/LivePages[''"]')) {
    throw 'Expected LivePages import not found. No files changed.'
}
# Create backups only after all guards pass.
$backups = Join-Path $root 'local-backups'
New-Item -Path $backups -ItemType Directory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
foreach ($pair in @(@($settingsPath, 'settings'), @($urlsPath, 'urls'), @($appPath, 'App'))) {
    Copy-Item -LiteralPath $pair[0] -Destination (Join-Path $backups "$($pair[1])-before-operations-$stamp.bak")
}
if (-not $settings.Contains($marker)) {
    $settings = $settings.TrimEnd() + "`n`n" + [IO.File]::ReadAllText($fragmentPath, [Text.Encoding]::UTF8)
}
if (-not $urls.Contains("include('operations.urls')")) {
    $urls = $urls.TrimEnd() + "`n`nurlpatterns += [path('api/operations/', include('operations.urls'))]`n"
}
if ($hasOldScreen) {
    $app = [regex]::Replace($app, '<LiveSettings\s*/>', '<SocSettings/>')
    $app = [regex]::Replace($app, '(?m)(import\s+\{[^\n}]*),\s*LiveSettings(\s*\}\s+from\s+[''"]\./monitoring/LivePages[''"])', '$1$2')
    $app = [regex]::Replace($app, '(?m)(import\s+\{\s*)LiveSettings\s*,\s*([^\n}]*\}\s+from\s+[''"]\./monitoring/LivePages[''"])', '$1$2')
    if ([regex]::IsMatch($app, '(?m)^import\s+\{[^\n}]*\bLiveSettings\b[^\n}]*\}\s+from\s+[''"]\./monitoring/LivePages[''"]')) {
        throw 'Could not remove the unused LiveSettings import. Restore backups before retrying.'
    }
}
if (-not $hasSocSettings) {
    $app = "import { SocSettings } from './monitoring/SocSettings'`n" + $app
}
[IO.File]::WriteAllText($settingsPath, $settings, $enc)
[IO.File]::WriteAllText($urlsPath, $urls, $enc)
[IO.File]::WriteAllText($appPath, $app, $enc)
# Access hardening: only Django superusers may approve response requests.
$viewsPath = Join-Path $root 'backend\monitoring\views.py'
if (Test-Path $viewsPath) {
    $views = [IO.File]::ReadAllText($viewsPath, [Text.Encoding]::UTF8)
    if ($views.Contains('if not request.user.is_staff:')) {
        Copy-Item -LiteralPath $viewsPath -Destination (Join-Path $backups "monitoring-views-before-operations-$stamp.bak")
        $views = $views.Replace('if not request.user.is_staff:', 'if not request.user.is_superuser:')
        [IO.File]::WriteAllText($viewsPath, $views, $enc)
    }
}
# Do not overwrite a user's existing Git configuration; append only the backup exclusion.
$gitignore = Join-Path $root '.gitignore'
if (Test-Path $gitignore) {
    $content = [IO.File]::ReadAllText($gitignore, [Text.Encoding]::UTF8)
    if ($content -notmatch '(?m)^local-backups/\s*$') {
        [IO.File]::AppendAllText($gitignore, "`nlocal-backups/`n", $enc)
    }
}
Write-Host 'OK: operations app + SMTP config + Settings page connected.'
Write-Host 'OK: database files and existing credentials were not altered.'
Write-Host "Backups: $backups"
Write-Host 'NEXT: docker compose exec api python manage.py check'
Write-Host 'NEXT: docker compose exec api python manage.py migrate'
Write-Host 'NEXT: npm.cmd run build'
