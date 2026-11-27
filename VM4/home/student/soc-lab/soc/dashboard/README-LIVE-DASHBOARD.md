# VIOLET SOC — 실제 MariaDB 로그를 기존 화면에 연동

적용 대상: `C:\soc-mini\dashboard`, `feature/dashboard` 브랜치. 앞의 `soc-events-addon`과 SQL 367건 가져오기, `soc_app` SELECT 권한, Django `check/migrate`가 완료된 상태.

## 1. 설치

1. 이 ZIP **내부 파일**을 `C:\soc-mini\dashboard` 폴더에 압축 해제(하위 `soc-live-dashboard-addon` 폴더를 만들지 말고 `setup-live-dashboard.ps1`이 `dashboard` 바로 아래에 위치하도록).
2. VS Code PowerShell에서:

```powershell
cd C:\soc-mini\dashboard
Test-Path .\setup-live-dashboard.ps1
Test-Path .\src\monitoring\LivePages.tsx
Test-Path .\src\monitoring\liveApi.ts
powershell -ExecutionPolicy Bypass -File .\setup-live-dashboard.ps1
```

3. 백엔드 재시작 및 프론트 검증:

```powershell
docker compose restart api
npm.cmd run build
npm.cmd run dev
```

4. `http://localhost:5173` 로그인 후 전체 8개 메뉴를 확인. 

## 2. 변경 범위

* 설치 스크립트는 기존 `App.tsx`를 **그대로 복원 가능한 백업**으로 `local-backups`에 복사한 뒤 8개 메뉴 내용만 `LivePages.tsx` 컴포넌트로 교체합니다. 기존 보라색 UI, 사이드바/상단, 로그인, 계정 관리 ProfileMenu는 유지합니다.
* 신규 파일: `src/monitoring/LivePages.tsx`, `src/monitoring/liveApi.ts`, `src/monitoring/live-pages.css`.
* `backend/monitoring/views.py`의 기존 이벤트 응답에 `review_note`를 반환합니다. 대응 승인/반려는 `is_superuser`만 가능합니다.
* 원본 DB `socdb.events`는 읽기만 하며, 검토 상태·메모와 대응 요청 이력은 기존 Django DB `soc_dashboard`에 저장합니다.
* `local-backups/`는 `.gitignore`에 추가됩니다.

## 3. 화면별 제공 기능

| 메뉴 | 사용 데이터 / 동작 |
|---|---|
| Dashboard | 실제 로그 총수, Snort 건수, 등급/로그 유형 분포, 발생 추이(최신 날짜/월/연), 최근 이벤트, 대응 검토 요약 |
| Alert Management | 실제 이벤트 검색·필터·상세·원본·정규화, 상태/메모 DB 저장, 차단 검토 요청 기록 |
| Log Management | 실제 DB 서버 검색/타입 필터, 페이지당 50건, 행 선택 시 상세/원본 조회 |
| Security Monitoring | Snort, iptables, auditd, DVWA, MariaDB 로그 수집 근거 확인 (장비 '현재 온라인' 주장하지 않음) |
| Response History | 실제 Django 대응 검토 이력 및 관리자 승인·반려, **실제 방화벽 명령 없음** |
| IP Reputation | **외부 평판이 아니라** 로컬 이벤트에서 IP 출현 횟수 조회 |
| Reports | 실제 통계 기반 Markdown 보고서 초안 및 다운로드 |
| Settings | Django/DB 연결 테스트 및 미연동 기능 안내 |

모든 조회는 **로컬로 가져온 SQL 스냅샷** 기준이므로 VM4 실시간 동기화는 아직 연결하지 않았습니다. Dashboard/Alert/Report/IP 화면에서 최신 최대 2,000건까지 상세 집계하며, **DB 전체 행 수는 서버 통계**를 사용합니다. 현재 367건은 모두 포함됩니다. DB 시각의 시간대는 아직 검증하지 않았으므로 'DB 발생 시간'으로만 표시합니다.

## 4. 기능 테스트

1. Dashboard: `COLLECTED EVENTS`가 367로 표시되는지, Snort 298 / iptables 9 / auditd 17 / MariaDB 36 / DVWA 7 합계가 367인지.
2. Alert Management: 이벤트 선택 → 처리 상태 '분석 중' → 메모 입력 → 'DB 저장' → 새로고침 → 같은 이벤트 클릭 → 상태/메모 유지 확인.
3. Log Management: 유형 `snort` 선택 시 298건 (총 검색 결과), 출발지 IP/메시지 검색, 상세 원본 확인.
4. Response History: 검토 요청을 생성한 뒤 관리자 계정만 승인/반려 가능; 방화벽은 변경하지 않음.
5. Reports: 보고서 생성 후 `.md` 다운로드.

문제가 생기면 **터미널 오류 내용**과 `npm.cmd run build` 출력을 보내 주세요. 원본 App.tsx는 `local-backups`에 보관됩니다.

## 5. Git 반영 (로컬 빌드 및 기능 테스트 후)

```powershell
cd C:\soc-mini
git status --short
git add dashboard/src/App.tsx dashboard/src/monitoring/LivePages.tsx dashboard/src/monitoring/liveApi.ts dashboard/src/monitoring/live-pages.css dashboard/src/monitoring/SocEvents.tsx dashboard/backend/monitoring/views.py dashboard/setup-live-dashboard.ps1 dashboard/README-LIVE-DASHBOARD.md dashboard/.gitignore
git diff --cached --name-only
git commit -m "feat: connect Violet SOC pages to MariaDB events"
git push origin feature/dashboard
```

`local-data/socdb_dump.sql`, `.env`, `local-backups/`는 Git에 포함하지 마세요.

## 참고: 안전한 롤백

설치 전에 복사한 `local-backups/App-before-live-<timestamp>.tsx`를 `src/App.tsx`에 되돌리고 `backend/monitoring/views.py`도 대응하는 `monitoring-views-before-live-<timestamp>.py`로 복원하세요. 신규 파일은 그냥 남겨 두어도 기존 화면에서 import하지 않습니다.
