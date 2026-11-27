# VM4 - SOC System

## 1. 개요

VM4는 SOC 미니 프로젝트의 중앙 보안관제 서버이다.

VM2 및 VM3에서 발생하는 보안 로그와 시스템 로그를 수집하고, 정규화 및 데이터베이스 적재 과정을 거쳐 통합 보안관제 대시보드에서 조회할 수 있도록 구성하였다.

또한 관리자의 승인에 따라 VM2 방화벽에 실제 IP 차단 정책을 적용하는 원격 대응 기능을 구현하였다.

## 2. 주요 구성 요소

| 구성 요소 | 역할 |
|---|---|
| Ubuntu Linux | 호스트 운영체제 |
| Docker / Docker Compose | 컨테이너 실행 및 관리 |
| Fluent Bit 3.2 | 중앙 로그 수집 |
| Python Normalizer | 로그 파싱, 정규화 및 심각도 분류 |
| Python Loader | 정규화된 로그의 DB 적재 |
| MariaDB 10 | 보안 이벤트 및 관제 서비스 데이터 저장 |
| Django | 관제 서비스 Backend 및 API |
| React / TypeScript / Vite | 통합 보안관제 Dashboard |
| systemd | Normalizer 및 Loader 서비스 관리 |
| SSH / HMAC | VM2 방화벽 원격 대응 및 요청 검증 |

## 3. 네트워크 구성

| 항목 | 설정 |
|---|---|
| NAT Network 인터페이스 | enp0s3 |
| NAT Network IP | 10.0.2.140/24 |
| 기본 게이트웨이 | 10.0.2.1 |
| Host-only 인터페이스 | enp0s8 |
| Host-only IP | 192.168.56.140/24 |
| VM2 Firewall-IDS | 192.168.56.120 |
| VM3 Target-Server | 192.168.56.130 |

### 서비스 포트

| 서비스 | 주소 및 포트 |
|---|---|
| Fluent Bit Collector | 192.168.56.140:24224 |
| Dashboard | 192.168.56.140:5173 |
| MariaDB | 127.0.0.1:13306 |
| Django API | Docker 내부 TCP 8000 |
| VM2 원격 대응 | 192.168.56.120:22 |

Dashboard 접속 주소:

`http://192.168.56.140:5173`

## 4. 디렉터리 구성

```text
VM4/
├── etc/
│   ├── netplan/
│   ├── rsyslog.d/
│   ├── soc/
│   │   └── loader.env.example
│   └── systemd/system/
│       ├── soc-loader.service
│       └── soc-normalizer.service
├── home/student/soc-lab/soc/
│   ├── compose.yaml
│   ├── dashboard/
│   │   ├── backend/
│   │   ├── src/
│   │   ├── public/
│   │   ├── vm2-agent/
│   │   └── Dockerfile
│   ├── db/
│   │   └── schema.sql
│   ├── fluent-bit/
│   │   └── fluent-bit.conf
│   ├── loader/
│   ├── normalizer/
│   │   ├── parsers/
│   │   └── output/
│   └── logs/
├── containers.txt
├── docker-images.txt
├── network-addresses.txt
├── network-routes.txt
├── os-release.txt
├── packages.txt
├── python-packages.txt
├── services.txt
├── source-version.txt
└── README.md
```

## 5. 로그 처리 흐름

```text
VM2 / VM3
    |
    | Fluent Bit Forward (TCP 24224)
    v
VM4 Fluent Bit Collector
    |
    v
logs/incoming.log
    |
    v
Python Normalizer
    |
    v
normalizer/output/normalized.jsonl
    |
    v
Python Loader
    |
    v
MariaDB
    |
    v
Django API
    |
    v
React Dashboard
```

### 5.1 로그 수집

Fluent Bit Forward 프로토콜을 통해 외부 VM에서 로그를 수신하고 incoming.log 파일에 저장한다.

### 5.2 로그 정규화

수집된 로그를 유형별 Parser로 분석하고 공통 이벤트 형식으로 변환한다.

로그 유형, 출발지 및 목적지 IP, 프로토콜, 이벤트 내용, 심각도 등의 정보를 정규화한다.

iptables 로그의 경우 ACTION=DROP 표시를 통해 차단 목적의 로그와 일반 패킷 기록을 구분한다.

### 5.3 데이터베이스 적재

Loader는 정규화된 이벤트를 MariaDB에 적재한다.

### 5.4 통합 보안관제

Django Backend와 React Dashboard를 통해 수집된 보안 이벤트를 조회하고 분석한다.

## 6. 방화벽 원격 대응

관리자 승인 기반의 방화벽 원격 대응 기능을 구성하였다.

```text
보안 이벤트 확인
    |
IP 차단 요청
    |
관리자 승인
    |
HMAC 서명 요청 생성
    |
SSH를 통한 VM2 전송
    |
VM2 Agent 요청 검증
    |
iptables SOC_BLOCK 정책 적용
    |
실행 결과 반환 및 기록
```

VM2 Agent는 요청의 서명, 유효기간 및 대상 IP 등을 검증한 후 방화벽 정책을 적용한다.

SSH 개인키와 HMAC 서명키는 제출본에 포함하지 않는다. 재구축 시 VM2와 VM4 사이의 인증 환경을 별도로 구성해야 한다.

현재 원격 대응 기능은 IPv4 주소를 대상으로 한다.

## 7. 구축 및 실행

### 7.1 사전 요구사항

- Ubuntu Linux
- Docker Engine
- Docker Compose Plugin
- Python 3 및 Python 가상환경
- VM2 및 VM3와 통신 가능한 네트워크

### 7.2 프로젝트 배치

제출된 프로젝트 파일을 다음 경로에 배치한다.

`/home/student/soc-lab/soc`

### 7.3 Python 환경 구성

```bash
cd ~/soc-lab/soc

python3 -m venv .venv

.venv/bin/pip install -r loader/requirements.txt
```

python-packages.txt 및 각 구성 요소의 의존성 파일을 참고하여 필요한 패키지를 추가로 설치한다.

### 7.4 환경변수 및 데이터베이스 설정

다음 파일을 참고하여 실제 환경에 맞는 인증정보를 설정한다.

- etc/soc/loader.env.example
- dashboard/env.example
- dashboard/env.integration.example
- dashboard/env.runtime.example

실행 시 다음 환경변수 파일이 필요하다.

- /etc/soc/loader.env
- /home/student/soc-lab/soc/dashboard/.env

MariaDB의 SOC 이벤트 스키마, Dashboard용 데이터베이스 및 접근 계정은 db/schema.sql과 Dashboard 관련 설정 문서를 참고하여 구성한다.

### 7.5 Docker 서비스 실행

```bash
cd ~/soc-lab/soc

sudo docker compose up -d --build
```

### 7.6 systemd 서비스 구성

제출된 서비스 설정 파일을 /etc/systemd/system/에 배치한다.

```bash
sudo systemctl daemon-reload

sudo systemctl enable --now soc-normalizer.service

sudo systemctl enable --now soc-loader.service
```

### 7.7 실행 상태 확인

```bash
sudo docker compose ps

sudo systemctl status soc-normalizer.service

sudo systemctl status soc-loader.service
```

```bash
sudo journalctl -u soc-normalizer.service -n 20

sudo journalctl -u soc-loader.service -n 20
```

## 8. 참고 사항

- 본 환경은 보안 교육 및 SOC 기능 구현을 목적으로 구성하였다.
- 실제 수집 로그, DB 덤프, Docker 데이터 볼륨, 가상환경, 개인키 및 인증정보는 제출 대상에서 제외하였다.
- 원격 방화벽 대응 기능을 사용하려면 VM2 Agent 및 SSH/HMAC 인증 환경을 별도로 구성해야 한다.
- DB 초기화, 사용자 계정 생성 및 인증정보 설정이 필요하다.
- 현재 구성은 실습 환경을 기준으로 하며 운영 환경 적용 시 추가적인 보안 강화가 필요하다.
- 본 제출본은 전체 운영체제 백업이 아닌 프로젝트 소스코드 및 설정 파일 제출본이다.
