================================================================
  통합 SOC 미니 프로젝트 | VM4 설치 및 실행 가이드
  Git 브랜치: vm4 / 정규화 스키마: v3.0 (영문)
================================================================

처음 설치하는 팀원: 1~5번 순서대로 진행
이미 설치한 팀원:   4번(실행), 5번(검증) 참고

모든 명령은 VM4 Ubuntu 터미널에서 실행한다.
Git 주소와 DB 비밀번호는 팀에서 공유받은 값을 사용한다.


1. VM4 구성
----------------------------------------------------------------
VM2 (Snort, iptables) ─┐
                       ├→ Fluent Bit → Python Normalizer
VM3 (DVWA, MariaDB) ───┘       → Python DB Loader → MariaDB

VM2 IP     : 192.168.56.120
VM3 IP     : 192.168.56.130
VM4 IP     : 192.168.56.140
로그 수신  : 192.168.56.140:24224
SOC DB     : 127.0.0.1:13306 (VM4 내부 접속용)
DB 이름    : socdb / 테이블: events

현재 완료 범위: 로그 수집, 정규화, 초기 심각도 분류, DB 적재
후속 작업: 이벤트 상관분석, SOC Dashboard, 통합 검증


2. 최초 1회 - Git에서 코드 내려받기
----------------------------------------------------------------
[2-1] 기본 환경 준비

  ip -br addr
  sudo apt update
  sudo apt install -y git python3-venv
  sudo docker --version
  sudo docker compose version

VM4의 Host-only IP가 192.168.56.140인지 확인한다.
Docker와 Compose가 설치되어 있어야 한다. 미설치 시 Ubuntu 24.04의
기본 패키지를 사용하는 환경에서는 다음 명령으로 설치할 수 있다.

  sudo apt install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker

[2-2] 새로 clone하는 경우

  mkdir -p ~/soc-lab
  read -r -p 'Git repository URL: ' REPO_URL
  git clone -b vm4 --single-branch "$REPO_URL" ~/soc-lab/soc
  cd ~/soc-lab/soc
  git branch --show-current
  ls

Git 저장소 주소를 입력한다. 브랜치는 vm4여야 한다.
이미 ~/soc-lab/soc에 작업한 파일이 있다면 덮어쓰지 않는다.

저장소에 하위 디렉터리가 포함되어 compose.yaml이 보이지 않는 경우:

  find . -maxdepth 4 -name compose.yaml

VM4의 compose.yaml, normalizer/, loader/, db/가 있는 폴더로 이동한다.
이후 문서의 ~/soc-lab/soc는 해당 실제 경로로 바꾸어 실행한다.

[2-3] 이미 clone한 경우 (2-2 대신 실행)

  cd ~/soc-lab/soc
  git status
  git fetch origin
  git switch vm4
  git pull --ff-only origin vm4

로컬 vm4 브랜치가 없을 때만 git switch vm4 대신 아래 명령을 사용한다.

  git switch -c vm4 --track origin/vm4

로컬 변경사항이 있거나 충돌이 발생하면 덮어쓰지 말고 확인한다.


3. 최초 1회 - Git clone 이후 추가로 해야 할 작업
----------------------------------------------------------------
Git으로 소스코드를 받아도 컨테이너, DB 테이블, Python 가상환경은
각 VM에서 별도로 준비해야 한다.

[3-1] 로그 저장 디렉터리 준비

  cd ~/soc-lab/soc
  mkdir -p logs normalizer/output
  touch logs/incoming.log
  touch normalizer/output/{normalized,excluded,unparsed}.jsonl

[3-2] Docker 설정 확인 및 컨테이너 실행

  vi compose.yaml

기존 설정이 다음과 일치하는지 확인한다. 맞으면 수정할 필요 없다.
  db 서비스 포트         : 127.0.0.1:13306:3306
  fluent-bit 서비스 포트 : 192.168.56.140:24224:24224
  MARIADB_DATABASE       : socdb
  MARIADB_USER           : student
  MARIADB_PASSWORD       : 팀에서 공유받은 DB 비밀번호
  MARIADB_ROOT_PASSWORD  : 팀에서 공유받은 root 비밀번호
  DB 데이터 볼륨         : soc_db_data:/var/lib/mysql

  sudo docker compose config --quiet
  sudo docker compose up -d
  sudo docker compose ps

soc-db, soc-fluent-bit 두 컨테이너가 실행 중이면 정상이다.
기존 DB 볼륨의 비밀번호는 Compose 환경변수만 수정해도 변경되지 않는다.

[3-3] MariaDB 테이블 생성 (DB가 준비된 후 실행)

  sudo docker compose exec -T db sh -c \
  'mariadb -u "$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' \
  < db/schema.sql

  sudo docker exec -it soc-db mariadb -u root -p socdb

root 비밀번호 입력 후 MariaDB 프롬프트에서 실행:

  SHOW TABLES;
  SELECT COUNT(*) FROM events;
  EXIT;

events 테이블이 보이면 정상이다. 신규 DB의 데이터 건수는 0이다.

[3-4] Python 가상환경 생성 및 라이브러리 설치

  cd ~/soc-lab/soc
  python3 -m venv .venv
  source .venv/bin/activate
  python -m pip install -r loader/requirements.txt
  python -m compileall -q normalizer loader
  python -m loader.database

DB 비밀번호(student 계정)를 입력한다.
[SUCCESS] Connected to MariaDB가 출력되면 설치 완료.

※ .venv는 Git으로 공유하지 않는다. 각 팀원이 직접 생성해야 한다.
※ 새 SSH 터미널에서 Loader를 실행할 때 가상환경을 다시 활성화한다.


4. 평소 실행 방법 - SSH 터미널 2개 사용
----------------------------------------------------------------
먼저 Docker 컨테이너를 실행한다.

  cd ~/soc-lab/soc
  sudo docker compose up -d

[터미널 1] 정규화 엔진 (Normalizer)

  cd ~/soc-lab/soc
  python3 -u -m normalizer.main

위 명령은 실행 이후 들어오는 신규 로그를 처리한다.
최초 설치 시 출력 파일이 모두 비어 있고 기존 원본 로그도 처리하려면
위 명령 대신 아래 명령을 1회 실행한다.

  python3 -u -m normalizer.main --from-start

두 명령을 동시에 실행하지 않는다.

[터미널 2] DB 적재 엔진 (Loader)

  cd ~/soc-lab/soc
  source .venv/bin/activate
  python -u -m loader.main --follow

DB 비밀번호(student 계정)를 입력한다.
기존 정규화 로그와 이후 신규 로그를 MariaDB에 자동 적재한다.
두 터미널 모두 실행 상태로 유지한다. 종료할 때는 각각 Ctrl+C.


5. 정상 작동 확인 - 별도의 SSH 터미널 사용
----------------------------------------------------------------
[5-1] 원본 및 정규화 로그 확인

  cd ~/soc-lab/soc
  tail -n 3 logs/incoming.log
  tail -n 1 normalizer/output/normalized.jsonl | python3 -m json.tool
  wc -l logs/incoming.log normalizer/output/*.jsonl
  tail -n 5 normalizer/output/unparsed.jsonl

normalized.jsonl : 정규화 성공
excluded.jsonl   : 수집 대상 외
unparsed.jsonl   : 미분류 또는 실패 (0건 권장)

정규화 결과는 schema_version이 3.0이고 필드명이 영문이어야 한다.
신규 out_file 로그는 tag 및 forward_timestamp 정보도 보존한다.

[5-2] DB 적재 확인 (root 접속)

  sudo docker exec -it soc-db mariadb -u root -p socdb

  SELECT COUNT(*) FROM events;

  SELECT log_type, COUNT(*) AS total
  FROM events GROUP BY log_type;

  SELECT severity, COUNT(*) AS total
  FROM events GROUP BY severity;

  SELECT DATE_ADD(event_time, INTERVAL 9 HOUR) AS time_kst,
         log_type, severity, message
  FROM events ORDER BY inserted_at DESC LIMIT 10;

[5-3] 실시간 연동 테스트

  ① Normalizer와 Loader가 모두 실행 중인지 확인한다.
  ② DVWA 로그인 페이지를 새로고침한다.
     http://192.168.56.130:4280/login.php
  ③ 원본 로그와 정규화 로그에 신규 기록이 추가되는지 확인한다.
  ④ MariaDB에서 SELECT COUNT(*) FROM events; 를 다시 실행한다.

DB 건수가 증가하고 최근 이벤트 조회에 새 기록이 나오면 정상이다.
DB 접속 종료: EXIT;


6. 문제가 발생한 경우
----------------------------------------------------------------
[원본 로그가 들어오지 않음]
  sudo docker compose ps
  sudo docker logs --tail 30 soc-fluent-bit
  VM2, VM3의 Fluent Bit Agent 및 전송 주소를 확인한다.

[원본은 들어오는데 정규화되지 않음]
  pgrep -af 'python3.*normalizer'
  tail -n 5 normalizer/output/unparsed.jsonl
  Normalizer 실행 상태를 확인한다. 중복 실행하지 않는다.

[정규화는 되는데 DB에 적재되지 않음]
  pgrep -af 'python.*loader'
  tail -n 5 loader/failed.jsonl
  source .venv/bin/activate
  python -m loader.database
  failed.jsonl이 없으면 아직 검증 실패가 기록되지 않았을 수 있다.
  스키마나 심각도 검증 오류는 Normalizer와 Loader의 정책을 확인한다.

[Fluent Bit 설정 변경 후 적용되지 않음]
  sudo docker compose up -d --no-deps --force-recreate fluent-bit


7. 팀원 공통 주의사항
----------------------------------------------------------------
- VM2, VM3 Fluent Bit Agent는 192.168.56.140:24224로 전송해야 한다.
- VM2 Snort는 KST 기록 기준이다. VM4가 UTC여도 정규화는 KST로 처리한다.
- JSONL 시간은 KST, DB의 event_time 등 DATETIME 컬럼은 UTC로 저장한다.
- 심각도는 자체 SOC 분류 정책이며 KISA 공식 개별 로그 기준은 아니다.
- 동일 UUID는 DB에서 중복 적재되지 않는다. 단, 원본을 다시 정규화하면
  새로운 UUID가 생성되므로 --from-start를 반복 실행하지 않는다.
- Normalizer가 꺼져 있는 동안 들어온 원본 로그는 재시작 시 누락될 수 있다.
  현재 영구 읽기 위치 복구 기능은 없다. 원본을 삭제하지 말고 보존한다.
- docker compose down -v 는 DB 볼륨을 삭제할 수 있으므로 실행하지 않는다.
- .venv, 백업, 실제 로그, 비밀번호 등은 Git에 올리지 않는 것을 권장한다.
- git pull 후 Python 코드가 바뀌면 실행 중인 엔진을 재시작한다.
  라이브러리가 바뀌면 가상환경에서 아래 명령을 다시 실행한다.

  python -m pip install -r loader/requirements.txt

  DB 스키마 변경은 별도 안내에 따른다. 기존 테이블은 자동 변경되지 않는다.

================================================================
  주요 파일 위치
  compose.yaml                 Docker 서비스 설정
  fluent-bit/fluent-bit.conf   로그 수집 설정 (out_file)
  normalizer/                  정규화 및 심각도 분류 엔진
  loader/                      DB 적재 엔진
  db/schema.sql                events 테이블 생성 SQL
  logs/incoming.log            원본 로그
  normalizer/output/           정규화 결과 파일
================================================================
