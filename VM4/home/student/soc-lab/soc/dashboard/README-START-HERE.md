# VIOLET SOC — 서버 설정·SMTP 메일·알림 토글·차단 정책 검토 패키지

대상: `C:\soc-mini\dashboard` (이전에 `/soc-data`와 보라색 8개 메뉴가 동작하는 버전). **현재 동작하는 버전을 Git으로 먼저 커밋하거나 복사본을 보관하세요.**

## 무엇이 구현되나요?

| 항목 | 구현 내용 |
|---|---|
| Settings 이메일 메뉴 | 기존 Settings의 '연동 안 됨' 안내를 실제 설정 폼으로 대체 |
| 알림 ON/OFF | Django DB에 저장. OFF 시 수집은 계속하되 메일 발송 중단 |
| 알림 조건 | 최소 위험도 (info/low/medium/high/critical), 수신자 최대 5명 |
| SMTP | 서버 `.env`로 호스트/포트/계정/암호 보관; 암호는 API로 반환하지 않음 |
| 메일 테스트 | 관리자 전용 발송 버튼, 1분 제한 |
| 신규 이벤트 알림 | 별도 worker가 MariaDB의 신규 이벤트를 읽고 60초마다 검사. 1 이벤트당 한 번 보내도록 기록 |
| 기존 로그 보호 | OFF→ON 시 커서를 현재 로그 끝으로 이동하여 과거 367건 일괄 발송 방지 |
| IP 보호 정책 | 차단 보호 CIDR 저장, IP 적합성 미리보기. 관리자만 정책 수정 |
| Response History | 기존 검토/승인 이력 유지; 승인 권한을 superuser로 제한 |
| VM4 DB 연동 준비 | 서버 전용 SOC_LOGS_* 환경변수로 읽기 전용 원격 DB 접속을 바꿀 수 있게 함 |

**아직 구현되지 않은 것:** VM2 실제 방화벽 차단 실행(실행 에이전트·보안 통신·방화벽 검증 필요), VM4 네트워크 연결 그 자체, 외부 IP 평판, 메일 외 앱 내부 Bell 알림 센터. 기능을 구현한 것처럼 표시하지 않습니다.

## 0. 백업 (강력 권장)

PowerShell, `C:\soc-mini`에서:

```powershell
cd C:\soc-mini
git status --short
# 현재 안정 버전을 먼저 커밋하는 편이 좋습니다. .env, local-data, SQL 백업은 Git에 올리지 마세요.
```

## 1. ZIP 풀기

이 ZIP **안의 내용물 전체**를 `C:\soc-mini\dashboard`에 풀어 주세요. `backend/operations`, `src/monitoring/SocSettings.tsx`, `docker-compose.notifications.yml` 등이 생깁니다. 기존 `App.tsx`를 수동으로 덮어쓰지 않습니다.

```powershell
cd C:\soc-mini\dashboard
Test-Path .\install-operations.ps1
Test-Path .\backend\operations\views.py
Test-Path .\src\monitoring\SocSettings.tsx
```

세 항목이 `True`인지 확인하세요.

## 2. 기존 대시보드 설정 화면에 연결

```powershell
powershell -ExecutionPolicy Bypass -File .\install-operations.ps1
```

설치 스크립트는 `backend/config/settings.py`, `backend/config/urls.py`, `src/App.tsx`만 수정하고 `local-backups/`에 원본을 보관합니다. `backend/monitoring/views.py`에 오래된 승인 권한 코드가 있을 때에만 `is_staff`를 `is_superuser`로 변경합니다. 기존 DB·SQL·계정·디자인·페이지는 삭제하지 않습니다. 예상 구조와 다르면 수정하기 **전에 중지**합니다. 스크립트를 반복 실행하지 마세요.

### 수동 연결 방법 (설치 스크립트가 환경 차이로 중지되는 경우)

- `backend/config/settings.py`: ZIP의 `backend-operations-settings.fragment.py` 내용 끝에 추가 (이미 추가했다면 중복 금지).
- `backend/config/urls.py`: `urlpatterns += [path('api/operations/', include('operations.urls'))]` 추가.
- `src/App.tsx`: `import { SocSettings } from './monitoring/SocSettings'` 추가하고 기존 `<LiveSettings/>`를 `<SocSettings/>`로 변경, 사용하지 않는 `LiveSettings` import는 제거.

## 3. Django DB 마이그레이션

```powershell
docker compose up -d
docker compose exec api python manage.py check
docker compose exec api python manage.py migrate
```

`operations_...` 테이블은 **soc_dashboard** (Django DB)에만 생성됩니다. `socdb.events` 테이블을 변경하지 않습니다. 로그 수집 테이블은 계속 읽기 전용입니다.

## 4. React 빌드, 설정 화면 확인

```powershell
npm.cmd run build
npm.cmd run dev
```

`http://localhost:5173`에 **Django superuser**로 로그인 → **Settings** → `SMTP 및 알림 메일`을 확인하세요. 기본 설정은 OFF입니다. 사용자 관리, Dashboard, Log Management, Alert Management가 기존처럼 작동하는지도 확인하세요.

> 일반 analyst 계정은 설정 조회/변경 API 접근이 거절됩니다(403). 관리자만 보안 설정을 변경할 수 있습니다.

## 5. SMTP 연결 (실제 발송은 선택사항)

`SMTP-EXAMPLE.txt`를 참고해 기존 `C:\soc-mini\dashboard\.env` 맨 아래에 `SOC_SMTP_*` 값들을 추가하세요. 계정 발급/앱 비밀번호는 SMTP 공급업체 설정을 따르세요. 기존 `MARIADB_*`, `DJANGO_SECRET_KEY`를 절대 지우지 마세요. `.env`를 채팅이나 GitHub에 공유하지 마세요.

`.env` 변경 사항을 컨테이너에 적용하기 위해 다음 명령을 사용하세요:

```powershell
docker compose up -d --force-recreate api
```

Settings에서 SMTP 상태가 '서버 설정 감지됨'인지 확인하고 **테스트 메일 발송** 버튼으로 직접 검증하세요. `SMTP 상태`는 환경변수가 있는지만 확인하므로, 테스트 메일이 수신될 때까지 실제 발송 성공으로 판단하면 안 됩니다.

## 6. 신규 로그 자동 메일 발송 worker 시작

SMTP가 준비되었고 수신자도 지정한 다음 시작하세요:

```powershell
docker compose -f docker-compose.yml -f docker-compose.notifications.yml up -d --build
```

Settings에서 **신규 위험 이벤트 메일 알림 사용**을 ON, 수신자 및 최소 위험도를 지정한 다음 **설정 저장**을 누릅니다. 이메일은 '설정 저장'을 눌러야 서버에 반영됩니다. worker는 설정 상태를 60초마다 확인합니다.

```powershell
docker compose -f docker-compose.yml -f docker-compose.notifications.yml logs --tail 30 alert-worker
```

중단하려면 Settings에서 OFF로 변경 후 저장합니다. worker 자체를 정지하고 싶다면:

```powershell
docker compose -f docker-compose.yml -f docker-compose.notifications.yml stop alert-worker
```

백업으로 가져온 **기존 이벤트 367건은 발송되지 않습니다.** OFF→ON으로 다시 전환해도 과거 로그를 소급 발송하지 않습니다. 새 이벤트가 들어와야 자동 메일 발송을 확인할 수 있습니다. 로컬 DB가 정적 스냅샷이면 자동 메일이 발송되지 않는 것이 정상입니다.

**중복 주의:** 발송은 정상적으로 처리된 이벤트를 DB에 기록하고 중복을 건너뜁니다. 그러나 SMTP가 메일을 전송한 직후 서버가 종료되면 확인 기록이 남지 않아 재전송될 수 있습니다. 완전한 exactly-once 전송은 보장하지 않습니다. **worker는 하나만 실행**하세요.

## 7. VM4 실시간 로그 연동 준비 (아직 별도 작업)

팀원의 VM4에 MariaDB `socdb.events`가 실시간 갱신된다는 전제입니다.

1. VM4 담당자가 Django 전용 **SELECT만 허용된 계정**을 발급합니다. root 계정으로 연결하지 않습니다.
2. Windows Docker에서 VM4 IP로 DB 포트에 닿는 네트워크 경로가 있는지 검사합니다. Host-only VM 주소 `192.168.56.140`은 Docker에서 직접 접근되지 않을 수도 있습니다. 원격 3306을 인터넷에 공개하지 말고 사설 네트워크/VPN/보안 터널을 사용합니다.
3. `.env`에 선택적으로 `SOC_LOGS_HOST`, `SOC_LOGS_PORT`, `SOC_LOGS_DB`, `SOC_LOGS_USER`, `SOC_LOGS_PASSWORD`를 추가합니다. 메인 Django 인증 DB `soc_dashboard`의 설정은 그대로 둡니다.
4. `docker compose up -d --force-recreate api`와 worker 재생성 후, **Django에서 읽기 조회** 및 대시보드 신규 이벤트 반영을 확인합니다.

현 패키지는 네트워크 라우팅, VM4 DB 계정 생성, VM2 방화벽 에이전트 배포를 수행하지 않습니다. 따라서 로컬 스냅샷만 가지고는 실시간 수집/차단을 검증할 수 없습니다.

## 8. 실제 VM2 방화벽 차단: 추가 통합 작업

현재 Response History의 '승인'은 **승인 이력 기록**일 뿐 실제 iptables/Snort 차단이 아닙니다. VM2 담당자와 다음 사항을 준비한 뒤 통합해야 합니다: 방화벽의 안전한 관리 인터페이스(사설망/TLS), 관리자 승인 후 별도 실행 요청, 관리망/VM4/필수 통신 보호목록, 제한된 명령 목록, 실행 결과/실패 기록, 차단 해제 및 롤백 절차. 이 패키지는 `block-preview/`까지만 제공하며 어떤 방화벽 명령도 실행하지 않습니다.

## API 및 진단

- `GET, PUT /api/operations/settings/` (관리자 전용)
- `POST /api/operations/test-email/` `{ "email": "..." }` (관리자 전용, CSRF)
- `POST /api/operations/block-preview/` `{ "ip": "..." }` (관리자 전용, CSRF)
- `docker compose exec api python manage.py check`
- `docker compose exec api python manage.py migrate --check`
- `npm.cmd run build`
- `npm.cmd run lint` (이전 패치들 때문에 별도 ESLint 오류가 남아 있을 수 있습니다)

## GitHub 업로드

새 기능이 로컬에서 검증된 다음, 리포지토리 루트 `C:\soc-mini`에서 변경 사항을 먼저 확인하세요:

```powershell
cd C:\soc-mini
git status --short
git diff --stat
```

`dashboard/.env`, `dashboard/local-data/socdb_dump.sql`, `dashboard/local-backups/`, `dashboard/node_modules/`, DB 덤프 및 자격증명이 staging에 들어가지 않도록 확인하세요. 비밀이 포함된 파일은 커밋하면 안 됩니다.
