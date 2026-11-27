# Additive patch for the existing soc-login-addon. Run from dashboard root.
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$settingsPath = Join-Path $root "backend\config\settings.py"
$urlsPath = Join-Path $root "backend\config\urls.py"
$modelsPath = Join-Path $root "backend\monitoring\models.py"
if (-not (Test-Path $settingsPath) -or -not (Test-Path $urlsPath) -or -not (Test-Path $modelsPath)) {
    throw "Run from dashboard root; backend/config/settings.py and backend/monitoring/models.py must exist."
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$settings = [IO.File]::ReadAllText($settingsPath, [Text.Encoding]::UTF8)
if ($settings -notmatch "'monitoring'") {
    if (-not $settings.Contains("    'accounts',")) { throw "Cannot find accounts in settings.py; stop without editing." }
    Copy-Item $settingsPath "$settingsPath.before-events.bak" -Force
    $settings = $settings.Replace("    'accounts',", "    'accounts',`n    'monitoring',")
}
if ($settings -notmatch "DATABASES\['soc_logs'\]") {
    if (-not (Test-Path "$settingsPath.before-events.bak")) { Copy-Item $settingsPath "$settingsPath.before-events.bak" -Force }
    $settings += @'

# Read-only source database imported from the team's socdb_dump.sql.
# No migrations are run on this alias. Access via .using('soc_logs').
DATABASES['soc_logs'] = {
    'ENGINE': 'django.db.backends.mysql',
    'NAME': os.environ.get('SOC_LOGS_DB', 'socdb'),
    'USER': os.environ['DB_USER'],
    'PASSWORD': os.environ['DB_PASSWORD'],
    'HOST': os.environ.get('DB_HOST', 'db'),
    'PORT': os.environ.get('DB_PORT', '3306'),
    'OPTIONS': {'charset': 'utf8mb4'},
}
'@
}
[IO.File]::WriteAllText($settingsPath, $settings, $utf8)

$urls = [IO.File]::ReadAllText($urlsPath, [Text.Encoding]::UTF8)
if (-not $urls.Contains("include('monitoring.urls')")) {
    $target = "    path('api/auth/', include('accounts.urls'))," 
    if (-not $urls.Contains($target)) { throw "Cannot find API auth route in config/urls.py; please add monitoring route manually." }
    Copy-Item $urlsPath "$urlsPath.before-events.bak" -Force
    $urls = $urls.Replace($target, "$target`n    path('api/', include('monitoring.urls')),")
    [IO.File]::WriteAllText($urlsPath, $urls, $utf8)
}
# Adds a separate local test page without modifying existing dashboard views.
$mainPath = Join-Path $root "src\main.tsx"
if ((Test-Path $mainPath) -and (Test-Path (Join-Path $root "src\monitoring\SocEvents.tsx"))) {
    $main = [IO.File]::ReadAllText($mainPath, [Text.Encoding]::UTF8)
    $old = '<AuthProvider><App /></AuthProvider>'
    if ($main.Contains($old)) {
        Copy-Item $mainPath "$mainPath.before-events.bak" -Force
        $new = "<AuthProvider>{window.location.pathname === '/soc-data' ? <SocEvents /> : <App />}</AuthProvider>"
        $main = "import { SocEvents } from './monitoring/SocEvents'`n" + $main.Replace($old, $new)
        [IO.File]::WriteAllText($mainPath, $main, $utf8)
        Write-Host "OK: /soc-data test route added (existing App kept)."
    } elseif ($main.Contains('SocEvents')) {
        Write-Host "OK: /soc-data already configured."
    } else {
        Write-Host "NOTE: main.tsx differs; see README to add /soc-data manually."
    }
}
$gitignorePath = Join-Path $root ".gitignore"
if (-not (Test-Path $gitignorePath)) { [IO.File]::WriteAllText($gitignorePath, "", $utf8) }
$gitignore = [IO.File]::ReadAllText($gitignorePath, [Text.Encoding]::UTF8)
foreach ($item in @("local-data/", "*.before-events.bak")) {
    if (-not ($gitignore -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $item })) {
        $gitignore += "`n$item`n"
    }
}
[IO.File]::WriteAllText($gitignorePath, $gitignore, $utf8)
Write-Host "OK: monitoring app and soc_logs connection configured."
Write-Host "NEXT: import socdb_dump.sql into local MariaDB, grant SELECT on socdb.events to soc_app, then run docker compose exec api python manage.py migrate"
