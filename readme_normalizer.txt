통합 SOC 미니 프로젝트 - VM4 로그 수집 및 정규화 엔진 v2.0
================================================================
작성 기준: 2026-11-24 / Git 브랜치: vm4

프로젝트 목적
----------------
VM2(방화벽/IDS) 및 VM3(웹/DB 서버)의 이기종 로그를 VM4에서 통합 수집하고,
Python으로 공통 스키마에 정규화하여 SOC 분석 및 대시보드에 활용한다.

환경 및 구성
----------------
- VM2 firewall-ids: 192.168.56.120 / Snort, iptables, Fluent Bit
- VM3 web-server: 192.168.56.130 / Docker 기반 DVWA, MariaDB, Fluent Bit
  DVWA 공개 포트: 4280 (컨테이너 내부 80)
- VM4 soc-system: 192.168.56.140 / Python 3.12, Docker Compose
  soc-fluent-bit: Fluent Bit 3.2.10 (Forward 수신 24224/TCP)
  soc-db: MariaDB 10 계열 / DB 이름 socdb / Compose 서비스 db
  DB 데이터는 soc_db_data 볼륨에 저장. 현재 정규화 로그 DB 적재는 미구현.

로그 처리 흐름
------------------
VM2(Snort, iptables) / VM3(DVWA, MariaDB)
  -> 각 VM의 Fluent Bit Agent -> VM4 Fluent Bit Collector
  -> logs/incoming.log -> Python Normalizer
  -> normalizer/output/normalized.jsonl (정규화 성공)
     normalizer/output/excluded.jsonl   (수집 대상 외)
     normalizer/output/unparsed.jsonl   (파싱 실패)
  -> [후속] soc-db 적재 -> 이벤트 상관분석 -> SOC Dashboard

주요 파일 (기준 디렉터리: ~/soc-lab/soc)
-------------------------------------------
compose.yaml                   Docker Compose 서비스 구성
fluent-bit/fluent-bit.conf      Forward 입력, 파일 출력 설정
logs/incoming.log              원본 수집 로그
normalizer/main.py             입력 처리, 로그 분류, 실시간 실행, 파일 저장
normalizer/normalizer.py       공통 스키마, 자료형, KST 변환, 자산 정보 보완
normalizer/severity.py         초기 심각도 판정 정책
normalizer/parsers/snort.py    Snort 로그 파서 및 연도 추정
normalizer/parsers/iptables.py iptables 로그 파서
normalizer/parsers/dvwa.py     Apache/DVWA 로그 파서
normalizer/parsers/mariadb.py  MariaDB 로그 파서
normalizer/test_samples.py    검증용 코드로 교체 예정/적용 여부 확인 필요
normalizer/output/             정규화 결과 및 제외/미분류 로그

Fluent Bit Collector 최종 설정
----------------------------------
[SERVICE]
    Flush         1
    Log_Level     info
[INPUT]
    Name          forward
    Listen        0.0.0.0
    Port          24224
[OUTPUT]
    Name          file
    Match         *
    Path          /logs
    File          incoming.log
    Format        out_file

기존 plain 로그와 신규 out_file 로그 모두 Python에서 처리한다.
신규 형식은 태그 및 Fluent Bit 이벤트 시간을 보존한다.
예: vm3.dvwa: [Unix timestamp, {"log":"..."}]
기존 plain 로그의 수집태그/전달레코드시간은 null일 수 있다.

실행 및 확인 (VM4)
---------------------
cd ~/soc-lab/soc
sudo docker compose up -d
sudo docker compose ps
sudo docker logs --tail 20 soc-fluent-bit
python3 -m compileall -q normalizer

운영용 정규화 엔진 실행 (실행 이후 새로 들어오는 로그 처리):
  python3 -u -m normalizer.main

별도 SSH 터미널에서 확인:
  cd ~/soc-lab/soc
  tail -f logs/incoming.log
  tail -f normalizer/output/normalized.jsonl
  tail -n 1 normalizer/output/normalized.jsonl | python3 -m json.tool --no-ensure-ascii
  wc -l logs/incoming.log normalizer/output/*.jsonl
  tail -n 10 normalizer/output/unparsed.jsonl
  pgrep -af 'python3.*normalizer'

Fluent Bit 설정 변경 시 필요에 따라 Collector만 재생성:
  sudo docker compose up -d --no-deps --force-recreate fluent-bit

기존 로그 전체를 처음부터 처리하려면 --from-start 사용.
현재 로그 전체만 처리하고 종료하려면 --once 사용.
두 옵션 모두 출력 파일에 추가 기록하므로 기존 결과와 중복될 수 있다.
재처리 시에는 엔진을 중지하고 기존 출력과 원본을 백업한 후 별도로 진행한다.
원본 incoming.log는 삭제하거나 초기화하지 않는다.

정규화 스키마 v2.0
---------------------
공통 필드:
스키마버전, 이벤트ID, 발생시간, 발생시간출처, 로그기록시간,
전달레코드시간, 정규화시간, 수집원, 수집태그, 로그유형, 이벤트분류,
이벤트유형, 심각도, 심각도등급, 심각도판정근거, 심각도정책,
출발지IP, 출발지포트, 목적지IP, 목적지포트, 목적지정보출처,
프로토콜, 메시지, 상세정보, 원본로그

- 시간: ISO 8601, KST(+09:00), 마이크로초 단위
- Snort: VM2 KST 기준, 연도는 기준시간과 가까운 연도로 추정
- Docker 기록시간 또는 Fluent Bit 이벤트시간으로 발생시간 보완 가능
- 정규화시간은 처리시간이며 실제 수집시간과 동일하지 않을 수 있음
- 이벤트ID: UUID, 재처리 시 새로운 UUID 생성(원본 중복 방지와는 별개)
- IP: 문자열 또는 null, 포트: 0~65535 정수 또는 null
- ICMP 포트: null / iptables LOG 자체는 허용·차단을 증명하지 않음
- DVWA 목적지: 자산 설정 기반 192.168.56.130:4280 (실제 패킷 필드 아님)
- 상세정보: 로그 종류별 동일 필드 유지, 미확인 값은 null
- 원본로그: 파싱 대상 메시지를 보존, 전체 전달 레코드는 incoming.log에 유지

초기 심각도 분류
-------------------
정책: SOC-SEVERITY-v1.0 (자체 SOC 이벤트 분류 정책)
0 정보: 일반 서비스 및 테스트 기록
1 낮음: 경미한 오류 또는 운영 경고
2 중간: 추가 분석이 필요한 의심 이벤트 또는 오류
3 높음: 높은 우선순위의 보안 탐지
4 심각: 중대한 침해 및 피해가 확인된 이벤트(후속 분석으로 결정)

KISA 사이버 위기 경보의 단계적 대응 개념을 참고한 자체 정책이며,
KISA의 개별 로그 공식 심각도 기준으로 표현하지 않는다.
초기 심각도는 공격 성공 여부를 의미하지 않는다.

검증 결과 (2026-11-24 확인 시점)
-----------------------------------
전체 원본 222건 = 정규화 183건 + 수집 대상 외 39건 + 미분류 0건
수집 대상 정규화 성공률: 100% (해당 검증 표본 기준)
Snort 19 / iptables 15 / DVWA 38 / MariaDB 111
심각도: 정보 171 / 낮음 12
공통 스키마 종류: 1 / 스키마 버전: 2.0
발생시간 누락 0 / 이벤트ID 누락 0 / 중복 UUID 0 / 검증 오류 0
발생시간 출처: 원본로그 158 / 원본 및 연도추정 19 / Docker 기록시간 6
이후 Collector 재생성으로 태그 보존 및 신규 정규화 작동 확인.
중간·높음 심각도는 별도 테스트 데이터 검증 필요.

운영 및 협업 주의사항
-------------------------
- VM2는 KST, VM4는 UTC로 확인됨. Python에서 KST로 변환하므로 문제 없음.
- 정규화 엔진은 실행 중에만 파일을 처리하며 동시에 두 개 실행하지 않는다.
- 영구 읽기 위치 저장 및 원본 중복 방지 기능은 아직 없음.
  엔진이 꺼진 동안 들어온 로그는 기본 실행 방식에서 건너뛸 수 있다.
- test_samples.py가 [START] SOC Log Normalizer를 표시하면 구버전일 수 있다.
  운영용 엔진 대신 실행하지 말고, 검증 전용 코드로 교체 여부를 확인한다.
- Git에는 소스와 설정 예시를 관리하고 비밀번호, 실제 운영 로그, 백업,
  __pycache__ 등은 가급적 제외한다. 기존 변경사항은 git status로 확인한다.
