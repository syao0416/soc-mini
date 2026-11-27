# VM3 - Target Server

## 1. 개요

VM3는 SOC 미니 프로젝트에서 공격 대상 서버 역할을 담당한다.

Docker 기반의 DVWA 및 MariaDB 환경을 구성하여 웹 취약점 공격을 재현하고, Apache, MariaDB 및 auditd 로그를 수집하여 SOC 시스템으로 전송한다.

Apache 로그는 VM2에도 별도로 전송하여 로그 기반 보안 대응에 활용할 수 있도록 구성하였다.

## 2. 주요 구성 요소

| 구성 요소 | 역할 |
|---|---|
| Ubuntu Linux | 호스트 운영체제 |
| Docker | 컨테이너 실행 환경 |
| Docker Compose | 컨테이너 구성 및 관리 |
| DVWA | 웹 취약점 실습 환경 |
| Apache | 웹 서비스 및 접근 로그 생성 |
| MariaDB 10 | DVWA 데이터베이스 |
| Fluent Bit 3.2 | 로그 수집, 분류 및 전송 |
| auditd | 호스트 명령어 실행 감사 |

## 3. 네트워크 구성

| 항목 | 설정 |
|---|---|
| 네트워크 유형 | Host-only Network |
| 인터페이스 | enp0s8 |
| IP 주소 | 192.168.56.130 |
| 서브넷 마스크 | 255.255.255.0 (/24) |
| 기본 게이트웨이 | 192.168.56.120 (VM2) |
| 웹 서비스 포트 | TCP 4280 |
| SOC 서버 | 192.168.56.140 |

VM3는 VM2를 기본 게이트웨이로 사용한다.

DVWA 접속 주소:

`http://192.168.56.130:4280`

## 4. 디렉터리 구성

```text
VM3/
├── etc/
│   ├── audit/
│   ├── netplan/
│   └── rsyslog.d/
├── home/student/target-server/DVWA/
│   ├── compose.yml
│   ├── Dockerfile
│   ├── config/
│   ├── database/
│   ├── fluent-bit/
│   │   └── fluent-bit.conf
│   └── 기타 DVWA 소스코드
├── containers.txt
├── docker-images.txt
├── dvwa-origin.txt
├── network-addresses.txt
├── network-routes.txt
├── os-release.txt
├── packages.txt
├── services.txt
└── README.md
```

원본 시스템의 디렉터리 계층을 유지하여 설정 파일 및 프로젝트 소스코드를 구성하였다.

## 5. Docker 구성

| 컨테이너 | 이미지 |
|---|---|
| dvwa-dvwa-1 | ghcr.io/digininja/dvwa:latest |
| dvwa-db-1 | mariadb:10 |
| vm3-fluent-bit | fluent/fluent-bit:3.2 |

DVWA 컨테이너의 TCP 80 포트를 호스트의 192.168.56.130:4280에 연결한다.

MariaDB 데이터 및 Fluent Bit의 로그 수집 상태는 Docker Named Volume을 통해 관리한다.

각 컨테이너에는 `restart: unless-stopped` 정책을 적용하였다.

## 6. 로그 수집 및 전송

### 6.1 Apache 및 MariaDB

Docker의 json-file 로깅 드라이버를 사용한다.

컨테이너에 log_source 라벨을 부여하여 Apache와 MariaDB 로그를 구분한다.

Fluent Bit은 Docker 컨테이너 로그를 수집하고 다음 태그로 분류한다.

- vm3.apache
- vm3.mariadb

### 6.2 auditd

호스트의 `/var/log/audit/audit.log` 파일을 Fluent Bit에서 수집한다.

감사 정책 파일:

`/etc/audit/rules.d/50-soc-exec.rules`

32비트 및 64비트 환경의 execve, execveat 시스템 호출을 대상으로 AUID 1000 사용자의 명령어 실행을 기록한다.

수집된 로그에는 `vm3.auditd` 태그를 부여한다.

### 6.3 로그 전송 목적지

| 로그 | 목적지 | 포트 |
|---|---|---|
| Apache | VM4 (192.168.56.140) | TCP 24224 |
| MariaDB | VM4 (192.168.56.140) | TCP 24224 |
| auditd | VM4 (192.168.56.140) | TCP 24224 |
| Apache | VM2 (192.168.56.120) | TCP 242
