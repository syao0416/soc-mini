# SOC Dashboard - 사용자 관리 기능 추가

이 패키지는 기존에 동작하는 **Django 로그인 + MariaDB + React** 프로젝트에 관리자 전용 사용자 관리 기능을 추가합니다. `socdb_dump.sql`이나 `events` 테이블은 이번 단계에서 건드리지 않습니다.

## 설치 위치

ZIP **안의 파일과 폴더**를 `C:\soc-mini\dashboard`에 복사하세요. 현재 로그인 파일을 삭제하지 마세요.

```text
C:\soc-mini\dashboard\
├── backend\accounts\admin_users.py      새 파일
├── src\auth\adminApi.ts                 새 파일
├── src\auth\UserManagement.tsx          새 파일
├── src\auth\user-management.css         새 파일
├── setup-admin.ps1                       새 파일
└── README-ADMIN.md                       이 안내 파일
```

기존 `backend\accounts\urls.py`, `backend\accounts\views.py`, `src\auth\ProfileMenu.tsx`는 설치 스크립트가 **필요한 부분만 수정**합니다. 수정 전에 `.before-admin.bak` 파일을 만듭니다. `App.tsx`는 수정하지 않습니다.

## 실행 순서

VS Code PowerShell:

```powershell
cd C:\soc-mini\dashboard
powershell -ExecutionPolicy Bypass -File .\setup-admin.ps1
docker compose restart api
npm.cmd run dev
```

`npm.cmd run dev`가 이미 실행 중이라면 Vite가 수정사항을 자동 반영할 수 있으니 새로 띄우지 않아도 됩니다. 로그인 후 오른쪽 상단 사용자 메뉴에서 **사용자 관리**를 클릭하세요. (관리자/superuser만 표시됩니다.)

## 가능한 일

- 사용자 목록 조회·검색
- 관제 요원 및 관리자 계정 발급
- 계정 활성화/비활성화
- 사용자 권한 변경 (`admin` / `analyst`)
- 다른 사용자 비밀번호 재설정
- 자기 자신의 관리자 권한 해제 및 계정 비활성화 방지

권한은 Django API에서도 확인합니다. `is_superuser=True`인 계정만 관리자 기능을 실행할 수 있습니다. Django의 `auth_user` 테이블을 그대로 사용하므로 **새 마이그레이션이 필요하지 않습니다**. 기존 관리자 계정과 로그인 상태는 유지됩니다.

## API

| 메서드 | 주소 | 용도 |
|---|---|---|
| GET | `/api/auth/users/` | 사용자 목록 |
| POST | `/api/auth/users/` | 계정 생성 |
| PATCH | `/api/auth/users/{id}/` | 권한/활성 상태 수정 |
| POST | `/api/auth/users/{id}/reset-password/` | 다른 사용자 비밀번호 재설정 |

## 주의

- **로컬 환경에서 먼저 테스트하세요.** Vercel의 React 화면은 외부에서 로컬 Docker Django API에 바로 연결할 수 없습니다.
- 관리자 권한 부여는 매우 강력합니다. 팀원에게 처음부터 superuser 권한을 주지 말고 일반 관제 요원으로 만들어 주세요.
- API는 비밀번호 원문을 저장하지 않으며, Django 비밀번호 유효성 검사를 거쳐 해시로 저장합니다.
- `.env`, DB 비밀번호, 실제 보안 로그를 GitHub에 올리지 마세요.
- 기존 `socdb_dump.sql`은 아직 적용하지 말고 관리자 기능이 정상 동작한 후 로그 연동 단계에서 사용하세요.

### 확인 방법

관제 요원 계정을 하나 만든 다음 로그아웃 → 관제 요원 계정으로 로그인 → 프로필 메뉴에 **사용자 관리가 없는지** 확인합니다. 관리자 계정으로 다시 로그인하면 메뉴가 보여야 합니다.

진단: `docker compose logs --tail 50 api`, 프론트: `npm.cmd run build`.
