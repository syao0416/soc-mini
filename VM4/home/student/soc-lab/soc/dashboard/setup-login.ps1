# Run from C:\soc-mini\dashboard after extracting this add-on.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'src'
$appPath = Join-Path $src 'App.tsx'
$mainPath = Join-Path $src 'main.tsx'
$vitePath = Join-Path $root 'vite.config.ts'

if (!(Test-Path $appPath) -or !(Test-Path $mainPath) -or !(Test-Path $vitePath)) {
    throw '이 파일은 dashboard 폴더에서 실행해야 합니다. (src/App.tsx, src/main.tsx, vite.config.ts가 필요합니다.)'
}
if (!(Test-Path (Join-Path $src 'auth/AuthProvider.tsx'))) {
    throw 'src/auth 파일이 없습니다. ZIP을 dashboard 폴더에 압축 해제했는지 확인해 주세요.'
}

# Only patch known anchor points; never overwrite the user's existing app.
$app = [System.IO.File]::ReadAllText($appPath)
$main = [System.IO.File]::ReadAllText($mainPath)
$vite = [System.IO.File]::ReadAllText($vitePath)

if ($app -notmatch 'ProfileMenu' -and $app -notmatch '<span className="avatar">SC</span>') {
    throw 'App.tsx에서 SC 프로필 표시를 찾지 못했습니다. 수동 수정이 필요합니다. README를 확인해 주세요.'
}
if ($main -notmatch 'AuthProvider' -and $main -notmatch '<App\s*/>') {
    throw 'main.tsx에서 <App />를 찾지 못했습니다. README를 확인해 주세요.'
}
if ($vite -notmatch "'/api'" -and $vite -notmatch 'plugins:\s*\[[^\]]+\]') {
    throw 'vite.config.ts에 자동으로 API 프록시를 추가하지 못했습니다. README대로 수동 설정해 주세요.'
}

# Backup changed files once.
foreach ($file in @($appPath, $mainPath, $vitePath)) {
    if (!(Test-Path "$file.before-login.bak")) { Copy-Item $file "$file.before-login.bak" }
}

if ($app -notmatch "from './auth/ProfileMenu'") {
    $app = "import { ProfileMenu } from './auth/ProfileMenu'`r`n" + $app
}
$app = $app.Replace('<span className="avatar">SC</span>', '<ProfileMenu />')
[System.IO.File]::WriteAllText($appPath, $app, [System.Text.UTF8Encoding]::new($false))

if ($main -notmatch "from './auth/AuthProvider'") {
    $main = "import { AuthProvider } from './auth/AuthProvider'`r`n" + $main
}
$main = [regex]::Replace($main, '<App\s*/>', '<AuthProvider><App /></AuthProvider>')
[System.IO.File]::WriteAllText($mainPath, $main, [System.Text.UTF8Encoding]::new($false))

if ($vite -notmatch "'/api'") {
    $vite = [regex]::Replace(
        $vite,
        '(plugins:\s*\[[^\]]+\])\s*,?',
        '$1,' + "`r`n  server: { proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } }",
        [System.Text.RegularExpressions.RegexOptions]::None
    )
}
[System.IO.File]::WriteAllText($vitePath, $vite, [System.Text.UTF8Encoding]::new($false))

$gitignorePath = Join-Path $root '.gitignore'
$ignoreLines = @('.env', '.venv/', '**/__pycache__/', '*.pyc', '*.sqlite3', '*.before-login.bak')
if (!(Test-Path $gitignorePath)) { [System.IO.File]::WriteAllText($gitignorePath, '') }
foreach ($line in $ignoreLines) {
    if (!((Get-Content $gitignorePath) -contains $line)) { Add-Content -Path $gitignorePath -Value $line }
}

$envPath = Join-Path $root '.env'
if (!(Test-Path $envPath)) {
    function New-RandomSecret {
        $buffer = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($buffer)
        $rng.Dispose()
        return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    }
    $password = New-RandomSecret
    $rootPassword = New-RandomSecret
    $djangoSecret = New-RandomSecret
    $envContent = @"
MARIADB_DATABASE=soc_dashboard
MARIADB_USER=soc_app
MARIADB_PASSWORD=$password
MARIADB_ROOT_PASSWORD=$rootPassword
DJANGO_SECRET_KEY=$djangoSecret
"@
    [System.IO.File]::WriteAllText($envPath, $envContent + "`r`n", [System.Text.UTF8Encoding]::new($false))
    Write-Host '로컬 개발용 .env가 새로 생성됐습니다. 이 파일을 Git에 올리지 마세요.'
} else {
    Write-Host '기존 .env가 있어 건드리지 않았습니다.'
}
Write-Host ''
Write-Host '완료! 다음 명령어: docker compose up -d --build'
Write-Host '그다음: docker compose exec api python manage.py createsuperuser'
Write-Host '마지막: npm.cmd run dev (다른 터미널)'
