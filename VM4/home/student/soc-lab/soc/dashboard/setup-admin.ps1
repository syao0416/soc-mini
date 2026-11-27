# Extend the existing SOC Django login with superuser-only account management.
# Run from C:\soc-mini\dashboard. Existing dashboard and login files are backed up.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$urlsPath = Join-Path $root 'backend\accounts\urls.py'
$viewsPath = Join-Path $root 'backend\accounts\views.py'
$profilePath = Join-Path $root 'src\auth\ProfileMenu.tsx'

foreach ($file in @($urlsPath, $viewsPath, $profilePath, (Join-Path $root 'backend\accounts\admin_users.py'), (Join-Path $root 'src\auth\UserManagement.tsx'))) {
    if (!(Test-Path $file)) { throw "Required file missing: $file`nExtract the ZIP into the dashboard folder first." }
}

$urls = [System.IO.File]::ReadAllText($urlsPath)
$views = [System.IO.File]::ReadAllText($viewsPath)
$profile = [System.IO.File]::ReadAllText($profilePath)

if ($urls -notmatch 'admin_users') {
    if (!$urls.Contains('from . import views') -or $urls -notmatch '(?m)^\]\s*$') {
        throw 'Cannot patch accounts/urls.py safely. Existing file format differs; no files were changed.'
    }
    $urls = $urls.Replace('from . import views', "from . import views`r`nfrom . import admin_users")
    $routes = @'
    path('users/', admin_users.users_view, name='auth-users'),
    path('users/<int:user_id>/', admin_users.user_detail_view, name='auth-user-detail'),
    path('users/<int:user_id>/reset-password/', admin_users.reset_password_view, name='auth-user-reset'),
'@
    $urls = [System.Text.RegularExpressions.Regex]::Replace($urls, '(?m)^\]\s*$', $routes + "`r`n]", 1)
}

# Keep the original auth API; ensure "admin" is the superuser, not any staff user.
if ($views -match "'admin' if user.is_staff else 'analyst'") {
    $views = $views.Replace("'admin' if user.is_staff else 'analyst'", "'admin' if user.is_superuser else 'analyst'")
} elseif ($views -notmatch "user\.is_superuser") {
    throw 'Cannot locate role calculation in accounts/views.py; no files changed.'
}

if ($profile -notmatch "import \{ UserManagement \} from './UserManagement'") {
    if (!$profile.Contains("import { useState } from 'react'")) {
        throw 'Cannot locate ProfileMenu import; no files changed.'
    }
    $profile = $profile.Replace("import { useState } from 'react'", "import { useState } from 'react'`r`nimport { UserManagement } from './UserManagement'")
}
if ($profile -notmatch 'setAdminOpen') {
    $anchor = '  const [open, setOpen] = useState(false)'
    if (!$profile.Contains($anchor)) { throw 'Cannot locate ProfileMenu state; no files changed.' }
    $profile = $profile.Replace($anchor, $anchor + "`r`n  const [adminOpen, setAdminOpen] = useState(false)")
}
if ($profile -notmatch 'soc-profile-manage') {
    $anchor = '        {error && <p className="soc-auth-error">{error}</p>}'
    if (!$profile.Contains($anchor)) { throw 'Cannot locate ProfileMenu dropdown; no files changed.' }
    $insert = @'
        {user.role === 'admin' && <button type="button" role="menuitem" className="soc-profile-manage" onClick={() => { setOpen(false); setAdminOpen(true) }}><ShieldCheck size={16}/> 사용자 관리</button>}
'@
    $profile = $profile.Replace($anchor, $insert + "`r`n" + $anchor)
}
if ($profile -notmatch '<UserManagement onClose') {
    $closing = [regex]::new('(?m)^    </div>\s*\r?\n  \)')
    if (!$closing.IsMatch($profile)) { throw 'Cannot locate ProfileMenu closing tag; no files changed.' }
    $profile = $closing.Replace($profile, "      {adminOpen && <UserManagement onClose={() => setAdminOpen(false)} />}`r`n    </div>`r`n  )", 1)
}

foreach ($file in @($urlsPath, $viewsPath, $profilePath)) {
    if (!(Test-Path "$file.before-admin.bak")) { Copy-Item $file "$file.before-admin.bak" }
}
$encoding = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($urlsPath, $urls, $encoding)
[System.IO.File]::WriteAllText($viewsPath, $views, $encoding)
[System.IO.File]::WriteAllText($profilePath, $profile, $encoding)

Write-Host 'SOC admin accounts installed. No database migration is needed.'
Write-Host 'Next: docker compose restart api'
Write-Host 'Then: npm.cmd run dev'
Write-Host 'In React: click top-right profile > User Management (superuser only)'
