# VIOLET SOC · VM4 실시간 로그 + VM2 승인 차단 + GitHub 팀 공유

**대상:** `C:\soc-mini\dashboard`에 이미 `monitoring`, `operations`, 로그인, Settings 및 8개 메뉴가 있는 현재 버전. **신규 프로젝트로 교체하지 않습니다.**

**이 패키지가 실제로 제공하는 것:** Django의 VM4 읽기 전용 DB 연결 확인 명령, 기존 대시보드 데이터 15초 자동 재조회, VM2로 전달할 관리자가 승인한 요청의 HMAC 서명, VM2 **기본 dry-run**의 독립 차단/해제 도구, VM2 실행 결과 서명 및 Django 검증/기록, Git에 필요한 코드 전체를 안전하게 스테이징하는 스크립트.

**이 패키지가 자동으로 할 수 없는 것:** 여러분의 로컬 C: 드라이브 직접 변경, VM4/VM2 접속, VM4 DBA 계정 발급, 네트워크 방화벽 열기, GitHub 원격 Push. **운영 방화벽 차단은 VM2 담당자가 명시적으로 실행해야 합니다.**

## 0. ZIP 압축 해제

ZIP **내용물 전체**를 `C:\soc-mini\dashboard`에 압축 해제합니다. 기존 `src`, `backend`, `.env`, DB 파일을 덮어쓰지 않습니다.

```
C:\soc-mini\dashboard\
  install-vm-integration.ps1
  README-VM4-VM2-GIT.md
  .env.integration.example
  VM4-READONLY-SETUP.sql.example
  vm2-integration-source\backend\operations\...   (설치 원본)
  vm2-agent\vm2_agent.py
  vm2-agent\test_vm2_agent.py
  scripts\stage-dashboard-safely.ps1
```

**다른 파일/폴더에 같은 이름의 파일이 있더라도 삭제하지 않습니다.** 실제 파일 내용이 다른지 확인하지 않고 중복으로 판단하지 않습니다.

## 1. 로컬 개발환경에 설치

PowerShell:

```powershell
cd C:\soc-mini\dashboard
Test-Path .\vm2-integration-source\backend\operations\management\commands\probe_soc_logs.py
Test-Path .\backend\operations\models.py
powershell -ExecutionPolicy Bypass -File .\install-vm-integration.ps1

docker compose exec api python manage.py check
docker compose exec api python manage.py migrate
docker compose exec api python manage.py probe_soc_logs
npm.cmd run build
```

- 현재 로컬 백업을 쓰고 있다면 `probe_soc_logs` 출력 `total_events: 367`이 예상됩니다.
- `migrate`는 **Django 운영 DB**에 VM2 실행 영수증 저장 테이블을 추가합니다. VM4의 팀 `socdb.events` 테이블은 건드리지 않습니다.
- `install-vm-integration.ps1`은 세 파일의 원본을 `local-backups/`에 복사하고, 이미 존재하는 로그인/Settings를 유지합니다. 프론트엔드의 기존 자동 조회 함수 구조가 예상과 다르면 폴링만 건너뜁니다.

## 2. VM4 실시간 로그 DB 연결

### A. VM4 담당자에게 요청할 사항

- VM4 내부에서 MariaDB `socdb.events`가 계속 INSERT되고 있는지 확인 (`SELECT COUNT(*), MAX(inserted_at) FROM socdb.events;`). **이미 있는 DB/테이블을 새로 만들거나 SQL 덤프를 가져오지 마세요.**
- Django 전용 계정 `soc_viewer`를 발급하고 `socdb.events` 테이블에 **`SELECT`만 허용**해 주세요. 예시는 `VM4-READONLY-SETUP.sql.example`에 있으며, 실제 접속 경로에 맞는 호스트 패턴은 팀원이 결정합니다.
- `192.168.56.140`은 이전 팀 설계에서 사용한 VM4 주소입니다. 실제 현행 VM 주소인지 확인하세요.
- VM4 포트 3306을 인터넷/공용 네트워크에 열지 않습니다. VirtualBox Host-only / VPN / SSH 터널 등 팀이 승인한 사설 경로만 사용합니다.

### B. Windows PC에서 네트워크 진단

```powershell
Test-NetConnection 192.168.56.140 -Port 3306
```

**Windows에서 연결 성공해도 Docker 컨테이너가 동일하게 접근할 수 있는지는 별도입니다.** 컨테이너 기준 진단:

```powershell
docker compose exec api python -c "import socket; s=socket.create_connection(('192.168.56.140',3306),timeout=3); print('VM4 TCP 연결 성공'); s.close()"
```

연결 실패 시 **접근 경로를 먼저 팀원과 해결**하세요. IP/방화벽을 무작정 바꾸지 마세요.

### C. Django에서 로그 DB만 VM4로 전환

**중요: 기존 로컬 스냅샷의 메일 알림 커서 때문에 과거 로그를 재발송하지 않도록 먼저 Settings에서 메일 알림을 OFF로 저장하고 작업자를 멈춰 주세요.**

```powershell
cd C:\soc-mini\dashboard
docker compose -f docker-compose.yml -f docker-compose.notifications.yml stop alert-worker
```

`dashboard/.env` 맨 아래에 `.env.integration.example`을 참고해 `SOC_LOGS_HOST`, `SOC_LOGS_PORT`, `SOC_LOGS_DB`, `SOC_LOGS_USER`, `SOC_LOGS_PASSWORD`를 **실제 값으로** 추가하세요. 기존 `MARIADB_*`와 `DJANGO_SECRET_KEY`, SMTP 정보는 삭제하거나 변경하지 마세요. **VM4 root 계정은 사용하지 않습니다.**

```powershell
docker compose -f docker-compose.yml -f docker-compose.notifications.yml up -d --force-recreate api
docker compose exec api python manage.py probe_soc_logs
```

출력의 `host`가 VM4이고 이벤트 건수가 실제 VM4 값과 일치하면 DB 읽기 연결은 성공입니다. 수초 후 `probe_soc_logs`를 다시 실행해 VM4에서 신규 로그가 들어온 만큼 건수가 증가하는지 확인하세요. 대시보드 통계도 15초마다 조회되도록 했습니다(단, 설치 시 `OK: Dashboard/Alert live poll` 표시가 나와야 함).

**연결 불가 시 복구:** `.env`의 `SOC_LOGS_*` 다섯 줄을 주석 처리 또는 제거하고 API 컨테이너를 재생성하면 로컬 `socdb` 백업으로 돌아갑니다. 인증 데이터 `soc_dashboard`는 그대로입니다.

메일을 재개하려면 Settings에서 알림 OFF→ON으로 **다시 저장**해 현재 VM4 이벤트까지 건너뛰는 기준점을 설정한 다음, worker를 시작하세요:

```powershell
docker compose -f docker-compose.yml -f docker-compose.notifications.yml up -d --force-recreate alert-worker
```

## 3. VM2 승인 기반 실제 차단/해제 (담당자 실습 환경에서만)

**아키텍처:** SOC 대시보드의 차단 요청 → Django superuser 승인 → Django가 **5분간 유효한 서명된 요청 JSON** 생성 → VM2 담당자가 VM2에서 *기본 dry-run*으로 검증 → 명시적 실행 → VM2에서 실행 결과 JSON 서명 → Django에서 검증·기록. 임의 원격 IP 차단 API나 백그라운드 자동 차단은 제공하지 않습니다.

- VM2에는 Python 3, `ip`(iproute2), `iptables`가 필요합니다. 담당자가 **FORWARD 체인**이 실제 VM3 경로에 영향을 주는지 확인해야 합니다. 이 도구는 VM2의 INPUT/OUTPUT 규칙이나 Snort 설정을 변경하지 않습니다.
- 기본 보호 주소: loopback, link-local, multicast, VM4 `192.168.56.140`. VM2 자신의 인터페이스 IP도 자동 보호하고 SSH 접속자의 IP도 보호합니다. **VM2 게이트웨이·관리 PC·필수 서비스의 IP를 `--protect`로 추가**해야 합니다.
- 실제 네트워크 정책 변경은 팀의 사전 승인과 격리된 실습 환경에서만 수행하세요. 첫 테스트에는 실제 서비스 IP가 아닌 테스트용 공격자 IP를 사용하세요.

### A. 키 준비 (개발자 PC 및 VM2 관리자 각각 보안 저장)

Python에서 난수 키를 생성합니다. 아래 출력은 **비밀키**이며 Git/Discord/채팅에 올리지 마세요.

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

이 값을 로컬 `dashboard/.env`에 `SOC_VM2_SIGNING_KEY=...`로 설정하고 API를 재생성합니다. 같은 키를 VM2 담당자에게 **안전한 경로**로 전달하여 VM2의 `/etc/violet-soc/vm2_signing_key`에 저장하고 `sudo chmod 600` 및 root 소유를 적용합니다. VM2 비밀키 파일은 절대로 Git으로 올리지 않습니다.

### B. Django 관리자 승인 및 서명된 요청 추출

대시보드에서 IP 차단/해제 요청을 만들고 **Django superuser가 승인**합니다. 승인 요청 번호를 예로 `42`라고 가정합니다.

```powershell
cd C:\soc-mini\dashboard
New-Item -ItemType Directory -Force .\backend\local-data | Out-Null
docker compose -f docker-compose.yml -f docker-compose.notifications.yml up -d --force-recreate api
docker compose exec api python manage.py export_vm2_approval --request-id 42 --output /app/local-data/approval-42.json
```

`42`는 **예시일 뿐**입니다. 실제 Response History의 승인된 요청 ID로 바꿔야 합니다. 호스트에는 `dashboard\backend\local-data\approval-42.json` 파일이 생깁니다. 요청 파일은 5분이 지나면 만료되므로, 발행과 VM2 실행을 가까운 시간에 진행해야 합니다. 이 폴더는 Git에서 제외됩니다.

### C. VM2 담당자의 dry-run, 그다음 명시적 실행

`vm2-agent/vm2_agent.py`와 `approval-42.json` 파일을 VM2에 안전하게 복사한 후, VM2에서:

```bash
sudo python3 vm2_agent.py --file approval-42.json --protect 192.168.56.1/32
```

먼저 `DRY-RUN` 출력과 보호 IP를 확인합니다. VM2 담당자가 대상 IP와 영향 범위를 확인한 후에만:

```bash
sudo python3 vm2_agent.py --file approval-42.json --protect 192.168.56.1/32 --apply --confirm APPLY --receipt vm2-receipt-42.json
sudo iptables -S VIOLET_SOC
```

`192.168.56.1/32`는 **예시의 보호 주소**입니다. VM2에서 실제로 사용 중인 관리 주소를 확인해 바꿔 주세요.

실제 적용 시에는 독립된 `VIOLET_SOC` iptables 체인을 FORWARD에 연결하고 해당 IPv4 source에만 DROP 규칙을 추가합니다. 중복은 확인하고, 승인 해제 요청의 경우 해당 체인의 DROP만 제거합니다. VM2의 다른 iptables 규칙을 임의 삭제하지 않습니다. **리부팅 후 정책 유지·복구는 팀 VM2의 자체 정책 관리 방식과 협의해야 합니다.**

### D. VM2 실행 영수증을 Django에 가져오기

VM2의 `vm2-receipt-42.json`을 PC의 `dashboard\backend\local-data`로 안전하게 복사한 뒤:

```powershell
docker compose exec api python manage.py import_vm2_receipt --file /app/local-data/vm2-receipt-42.json
```

Django가 서명을 검증하고 승인 ID, IP, 결과가 일치할 때만 `FirewallExecutionReceipt`에 저장합니다. Response API에는 `executed`와 `execution_result`가 반영됩니다. 대시보드를 새로고침하면 이력이 갱신됩니다. **이 영수증은 VM2가 보고한 실행 결과이며, 패킷 차단의 실제 효과는 VM2/VM3 네트워크 테스트로 추가 확인해야 합니다.**

## 4. 안전한 GitHub 공유 — 파일을 이름만 보고 삭제하지 않습니다

각 팀원이 재현하려면 **소스, migration, Compose, `.example` 예제 파일, 안내서 및 설치 스크립트**를 Push해야 합니다. 같은 이름이더라도 다른 폴더의 파일을 임의로 삭제하지 않습니다.

제외할 것은 **실제 비밀키·개인 설정·로그 백업 및 실행 영수증**입니다. 원격 VM4 DB를 사용하므로 367건 SQL 덤프를 Git에 넣지 않아도 됩니다. **인증·설정 저장용 로컬 Django 운영 DB는 여전히 필요합니다.**

```powershell
cd C:\soc-mini\dashboard
powershell -ExecutionPolicy Bypass -File .\scripts\stage-dashboard-safely.ps1
# 사전 목록만 출력됩니다.
powershell -ExecutionPolicy Bypass -File .\scripts\stage-dashboard-safely.ps1 -Stage
cd C:\soc-mini
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

**비밀번호/키/덤프/개인정보가 스테이징된 변경에 없는지** 반드시 확인하고, 프로젝트가 실행되는지 점검한 다음:

```powershell
cd C:\soc-mini
git commit -m "feat: integrate VM4 live logs and VM2 approved response workflow"
git push origin feature/dashboard
```

`git push`가 끝나야 팀원이 브랜치를 내려받을 수 있습니다. 이 설명서만으로 **자동 Push되지 않습니다**. `.vscode/`와 `normalizer/` 등의 **다른 팀원 폴더는 건드리지 않습니다.**

## 5. 최종 점검표

1. `docker compose exec api python manage.py check` 성공.
2. `docker compose exec api python manage.py migrate` 성공.
3. `npm.cmd run build` 성공.
4. VM4 전환 시 `probe_soc_logs`의 host와 건수가 실제 VM4와 일치.
5. 팀원이 VM4에서 새 로그를 생성하면 DB COUNT와 Dashboard가 갱신.
6. 메일 OFF일 때 발송되지 않음; SMTP 테스트 정상; 다시 ON할 때 과거 로그 소급 발송 없음.
7. VM2에서 승인 파일 dry-run 성공 및 관리망 보호 검증.
8. **명시적으로 실제 적용한 뒤** VM2에서 `VIOLET_SOC` 규칙 확인 + Django 실행 영수증 확인.
9. `git diff --cached`에서 비밀키·SQL 덤프 제외 확인 후 Push.

**성공 기준:** 제공된 코드의 정적 테스트를 통과한 것과 여러분의 VM2/VM4 환경에서 실시간 통합 테스트를 통과한 것은 다릅니다. 네트워크 접근 정보나 권한이 없는 상태에서는 후자를 완료했다고 주장할 수 없습니다.
