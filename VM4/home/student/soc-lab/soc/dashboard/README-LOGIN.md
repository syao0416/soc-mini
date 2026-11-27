# VIOLET SOC 로그인 연동 — React + Django + MariaDB

**파일 덮어쓰기 주의**: 이 압축 파일은 기존 `src/App.tsx`, `src/main.tsx`, `vite.config.ts`를 포함하지 않습니다. 사용자가 편집한 UI를 보존합니다. `setup-login.ps1`이 3개 파일에서 인증에 필요한 최소 변경만 자동 적용하며, 처음 실행 시 `.before-login.bak` 백업을 생성합니다.

## 1. 설치 (VS Code PowerShell)

작업 폴더: `C:\soc-mini\dashboard` (기존 `C:\Dashboard`가 아님)

1. `soc-login-addon.zip`을 **이 폴더에 압축 해제**합니다. 최종 파일 경로가 `C:\soc-mini\dashboard\backend\manage.py`, `C:\soc-mini\dashboard\src\auth\AuthProvider.tsx`, `C:\soc-mini\dashboard\docker-compose.yml`, `C:\soc-mini\dashboard\setup-login.ps1`이 되어야 합니다.
2. 터미널:

```powershell
cd C:\soc-mini\dashboard
powershell -ExecutionPolicy Bypass -File .\setup-login.ps1
```

이 스크립트는 `.env` 비밀번호를 자동 생성하고 `.gitignore`를 구성합니다. 앱 코드에서 현재 UI의 `<span className="avatar">SC</span>`만 `<ProfileMenu />`로 바꿉니다. Vite에 `/api` 프록시를 추가합니다.

## 2. Django + MariaDB 실행

Docker Desktop이 실행 중인지 확인하고:

```powershell
cd C:\soc-mini\dashboard
docker compose up -d --build
docker compose ps
docker compose exec api python manage.py createsuperuser
```

마지막 명령은 관리자의 로그인 ID/이메일(선택 사항)/비밀번호를 입력합니다. 비밀번호 입력은 화면에 표시되지 않으며 정상입니다.

백엔드 접속 테스트: `http://127.0.0.1:8000/api/auth/csrf/`에서 `csrfToken`이 담긴 JSON이 표시되어야 합니다. `http://127.0.0.1:8000/admin/`는 Django 관리 화면입니다. `http://127.0.0.1:8000/api/auth/me/`를 비로그인 상태에서 열면 401이 정상입니다.

## 3. React 시작

**새 터미널**에서:

```powershell
cd C:\soc-mini\dashboard
npm.cmd install
npm.cmd run dev
```

`http://localhost:5173` 접속 시 로그인 화면이 보이며, 방금 만든 Django 관리자로 로그인하면 기존 대시보드가 보여야 합니다. 상단 프로필 버튼을 클릭하면 ID와 로그아웃 메뉴가 표시됩니다.

**중요:** 브라우저 주소는 React `http://localhost:5173`을 사용하세요. API 프록시와 CSRF 설정이 이 로컬 개발 주소를 기준으로 맞춰져 있습니다.

## 4. GitHub 업로드

```powershell
cd C:\soc-mini
git status --short
git add dashboard/
git diff --cached --name-only
git commit -m "feat: add Django MariaDB login"
git push origin feature/dashboard
```

`dashboard/.env` 또는 비밀번호, DB 데이터 등이 올라가지 않도록 꼭 확인하세요.

## 5. 주요 인증 API

- `GET /api/auth/csrf/` : CSRF 토큰 발급
- `POST /api/auth/login/` : 로그인(JSON: `username`, `password`)
- `GET /api/auth/me/` : 현재 로그인 계정 조회
- `POST /api/auth/logout/` : 로그아웃

브라우저 세션 쿠키(`HttpOnly`)로 인증하며, 로그인과 로그아웃은 CSRF 토큰을 검사합니다. 비밀번호는 Django의 암호 해시를 이용해 DB에 저장됩니다. `admin`과 `analyst`는 처음에는 화면 표시 역할일 뿐, 향후 Alert API 개발 시 **반드시 Django 서버에서 권한도 검사해야** 합니다.

## 6. 실행 안 될 때

```powershell
docker compose logs api --tail 80
docker compose logs db --tail 80
```

- 기존 다른 Vite 서버(`C:\Dashboard`)가 `5173`을 사용 중이라면 먼저 종료하세요.
- `localhost:5174` 같은 다른 포트에서 실행되면 CSRF_TRUSTED_ORIGINS도 수정해야 합니다.
- 윈도우에 MariaDB를 별도 설치할 필요 없습니다. DB와 Django 모두 Docker에서 실행합니다.
- 이 배포 구성은 **로컬 개발용**입니다. Django `runserver`는 공개 인터넷용 운영 서버가 아닙니다.
- 현재 Vercel은 React만 배포하는 상태여서, 이 로그인 코드를 Vercel에 재배포해도 Django가 공개 HTTPS 서버에 없다면 로그인할 수 없습니다. 로컬에서 먼저 테스트하세요.
- VM4 배포 시에는 VM4 Docker 네트워크/DB 서비스와 실제 MariaDB 권한, HTTPS·프록시 설정을 함께 조정해야 합니다.

## 자동 수정을 사용하지 않고 직접 변경하고 싶다면

`src/main.tsx`의 최상단에 다음 import 추가:

```tsx
import { AuthProvider } from './auth/AuthProvider'
```

렌더링의 `<App />`를 `<AuthProvider><App /></AuthProvider>`로 변경.

`src/App.tsx` 최상단에 다음 import 추가:

```tsx
import { ProfileMenu } from './auth/ProfileMenu'
```

기존 상단의 `<span className="avatar">SC</span>`를 `<ProfileMenu />`로 교체.

`vite.config.ts`의 `defineConfig` 객체에 다음 속성을 추가:

```ts
server: { proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } } },
```
