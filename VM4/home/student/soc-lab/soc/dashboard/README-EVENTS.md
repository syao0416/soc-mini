# VIOLET SOC — MariaDB `socdb.events` 연동 추가 패키지

이 패키지는 이전 `soc-login-addon.zip`으로 Django 로그인이 작동하는 **기존** `C:\soc-mini\dashboard` 프로젝트에 **추가**하는 파일입니다. `App.tsx`를 덮어쓰지 않습니다. VM4에 바로 접속할 수 없어도 2026-11-25 받은 `socdb_dump.sql` 스냅샷으로 로그 조회를 테스트합니다.

**현재 실제 구현 범위**: 인증 후 실제 DB 로그 조회/검색/상세, DB에 Alert 검토 상태 저장, 차단/해제 *검토 요청* 및 관리자 승인/반려 DB 저장. **실제 iptables 차단은 실행하지 않습니다.** `/soc-data`는 별도 개발용 시험 화면으로, 기존 메뉴에 연결하는 것은 다음 단계입니다.

## 1. 파일 넣기

`soc-events-addon.zip`을 압축 해제해서 내부의 `backend/monitoring`, `src/monitoring`, `setup-events.ps1`, `README-EVENTS.md`를 아래 경로로 복사합니다. 기존 `backend/config/settings.py`, `backend/config/urls.py`, `src/main.tsx`는 직접 덮어쓰지 마세요. 스크립트가 원본을 `.before-events.bak`으로 백업하고 최소한만 수정합니다.

```powershell
cd C:\soc-mini\dashboard
powershell -ExecutionPolicy Bypass -File .\setup-events.ps1
```

이 단계에서 API 라우팅 `api/events`, DB 별칭 `soc_logs`, React 시험용 경로 `/soc-data`가 연결됩니다. 로그인 코드가 실행됐던 `AuthProvider` 구조를 기준으로 한 자동 연결입니다. 메시지가 `main.tsx differs`라면 `src/main.tsx`의 기존 `<AuthProvider><App /></AuthProvider>`을 `<AuthProvider>{window.location.pathname === '/soc-data' ? <SocEvents /> : <App />}</AuthProvider>`로 교체하고 `import { SocEvents } from './monitoring/SocEvents'`를 추가하세요.

## 2. 받은 SQL 파일은 반드시 **로컬 DB에만** 불러오기

**주의**: `socdb_dump.sql`에는 `DROP TABLE IF EXISTS events;`가 포함되어 있습니다. **VM4 또는 기존 로그 수집 DB에는 절대 실행하지 마세요.** 데이터가 삭제될 수 있습니다. 백업은 367건, `socdb.events` 테이블 하나만 포함합니다. 로컬 컨테이너에 `socdb` 테이블이 이미 있다면 가져오기 전에 해당 데이터가 없어져도 되는지 반드시 확인해야 합니다.

받은 `socdb_dump.sql`을 Windows에서 `C:\soc-mini\dashboard\local-data\socdb_dump.sql`로 저장합니다. `local-data/`는 `.gitignore`로 제외됩니다. 파일 자체는 압축에 들어 있지 않습니다.

```powershell
cd C:\soc-mini\dashboard
New-Item -ItemType Directory -Force .\local-data
# Windows 파일 탐색기로 SQL 파일을 local-data 폴더로 복사한 다음:
docker compose cp .\local-data\socdb_dump.sql db:/tmp/socdb_dump.sql
docker compose exec db mariadb -u root -p
```

DB root 비밀번호는 **자기 컴퓨터** `dashboard/.env`의 `MARIADB_ROOT_PASSWORD`입니다. 화면·채팅·GitHub에 공유하지 마세요. MariaDB 프롬프트(`MariaDB [(none)]>`)에서:

```sql
SOURCE /tmp/socdb_dump.sql;
GRANT SELECT ON socdb.events TO 'soc_app'@'%';
SELECT COUNT(*) FROM socdb.events;
QUIT;
```

367이 나오면 가져오기 성공입니다. `soc_app`은 이전 로그인 패키지의 기본 사용자명입니다. `.env`에서 `MARIADB_USER`를 변경했다면 SQL의 `soc_app`도 현재 사용자명으로 바꿔야 합니다. `GRANT SELECT`는 해당 DB 테이블 **읽기 권한만** 부여합니다.

참고: `soc_dashboard`는 기존 Django 사용자/처리 이력 DB, `socdb`는 팀원 로그 DB입니다. **두 DB를 같은 로컬 MariaDB 서버에서 분리하여 사용**합니다.

## 3. Django 테이블 생성

```powershell
cd C:\soc-mini\dashboard
docker compose exec api python manage.py check
docker compose exec api python manage.py migrate
```

로그 테이블 `socdb.events`는 `managed=False`라 Django가 만들거나 수정하지 않습니다. `soc_dashboard`에 `soc_event_reviews`, `soc_response_requests`가 생성됩니다. 관리자 계정은 기존에 만든 그대로 사용합니다.

## 4. React 시험용 화면 접속

```powershell
cd C:\soc-mini\dashboard
npm.cmd run dev
```

로그인 후 브라우저에서 **http://localhost:5173/soc-data**를 열어 보세요. 로그인하지 않았다면 로그인 화면이 나옵니다. 기능:

- VM2/VM3 실제 덤프 로그 367건 조회, 검색, 필터, 원본 로그 보기
- `신규 → 분석 중 / 처리 완료 / 오탐` 변경 후 MariaDB에 저장
- 출발지 IP가 있는 이벤트에서 차단 **검토 요청** 저장(iptables 실행 안 함)
- Django 관리자(`is_staff=True`)는 검토 요청 **승인/반려** 가능, 관제 요원은 불가
- 기존 대시보드(`/`)는 변경하지 않음. 기존 화면은 계속 DEMO DATA가 표시되므로 아직 '실시간 연동 완료'라고 표시하면 안 됩니다.

### 주요 API

| URL | 기능 |
| --- | --- |
| `GET /api/events/?limit=50&log_type=snort` | 인증된 사용자의 로그 목록 |
| `GET /api/events/stats/` | 로그 수 및 종류/위험도 통계 |
| `GET /api/events/<event_id>/` | 원본 로그·상세 증적 |
| `POST /api/events/<event_id>/review/` | `{ "status":"investigating", "note":"분석 시작" }` |
| `GET /api/responses/` | 검토/승인 이력 |
| `POST /api/responses/` | 차단/해제 검토 요청 저장 |
| `POST /api/responses/<id>/decision/` | 관리자만 `{ "decision":"approved" }` 또는 `rejected` |

모든 API는 기존 Django 세션 로그인이 필요하며, POST는 기존 로그인 API와 동일한 CSRF 토큰을 사용합니다.

## 5. 오류가 날 때

```powershell
docker compose ps
docker compose logs api --tail 80
# 로컬 MariaDB DB 목록과 권한은 관리자 명령으로 확인 가능
```

- `Table 'socdb.events' doesn't exist`: 로컬 SQL 가져오기 미완료
- `Access denied for user 'soc_app'`: `GRANT SELECT` 미완료 또는 잘못된 DB 사용자
- `Table 'soc_dashboard.soc_event_reviews' doesn't exist`: Django `migrate` 미완료
- `localhost:5173`에서 `/soc-data`가 기존 화면으로 뜨면 `src/main.tsx`의 라우팅이 바뀌지 않았는지 확인
- 데이터가 367건으로 고정인 이유: SQL 덤프는 **실시간 연동이 아닌 특정 시점 스냅샷**이기 때문. VM4와 연결된 뒤에야 새 로그가 자동으로 들어옵니다.

## 6. GitHub 커밋

로컬 SQL, `.env`, `node_modules` 또는 Python 캐시는 절대 올리지 마세요.

```powershell
cd C:\soc-mini
git status --short
git add dashboard/backend/monitoring dashboard/src/monitoring dashboard/setup-events.ps1 dashboard/README-EVENTS.md dashboard/backend/config/settings.py dashboard/backend/config/urls.py dashboard/src/main.tsx dashboard/.gitignore
git diff --cached --name-only
git commit -m "feat: integrate SOC event APIs and review workflow"
git push origin feature/dashboard
```

## 7. VM4 연동 시 변경사항

로컬 `socdb`는 백업 데이터이고 VM4의 `socdb`가 실제 최신 데이터입니다. Django의 `soc_logs` DB 별칭을 VM4의 읽기 전용 계정과 DB 호스트로 전환합니다. 필요하다면 `DB_USER/DB_PASSWORD`와 다른 읽기 전용 로그인 자격증명을 환경변수로 분리하세요. VM4에 이 SQL 덤프를 다시 가져오는 절차는 불필요하고 위험합니다. 사용자/처리 이력 데이터가 필요한 경우 `soc_dashboard` 데이터 이전과 마이그레이션을 별도로 계획해야 합니다.
