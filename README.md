# JIKIMI - 통합 보안관제 시스템

> SK쉴더스 루키즈 7기 미니 프로젝트 | 2조 서버지킴2

## 1. 프로젝트 개요

JIKIMI는 공격 재현부터 위협 탐지, 로그 수집, 이벤트 정규화, 시각화 및 방화벽 차단까지 일련의 보안관제 프로세스를 구현한 통합 보안관제 시스템이다.

VirtualBox 기반의 가상 네트워크 환경에 4개의 VM을 구성하고, 오픈소스 보안 솔루션과 자체 개발한 로그 처리 및 관제 시스템을 연동하였다.

### 프로젝트 목표

- 네트워크 분리를 통한 보안 실습 환경 구축
- 네트워크, 웹, 호스트 기반 보안 이벤트 탐지
- 방화벽 및 IDS를 활용한 위협 탐지와 차단
- 이기종 로그의 중앙 수집 및 정규화
- 통합 보안관제 대시보드 구현
- 관리자 승인 기반 원격 방화벽 차단 기능 구현

## 2. 시스템 아키텍처

### 가상머신 구성

| 구분 | 호스트명 | 운영체제 | 역할 |
|---|---|---|---|
| VM1 | kali | Kali Linux 2025.2 | 공격 재현 |
| VM2 | firewall-ids | Ubuntu Server 24.04 LTS | 게이트웨이, 방화벽, IDS |
| VM3 | target-server | Ubuntu Server 24.04 LTS | 웹 서비스 및 공격 대상 |
| VM4 | soc-system | Ubuntu Server 24.04 LTS | 로그 수집, 분석 및 통합 보안관제 |

### 네트워크 구성

| 네트워크 | 주소 대역 | 용도 |
|---|---|---|
| NAT Network | 10.0.2.0/24 | 외부 네트워크 연결 |
| Internal Network | 192.168.10.0/24 | 공격망 |
| Host-only Network | 192.168.56.0/24 | 서비스 및 관제망 |

| VM | Internal Network | Host-only Network |
|---|---|---|
| VM1 | 192.168.10.110 | - |
| VM2 | 192.168.10.120 | 192.168.56.120 |
| VM3 | - | 192.168.56.130 |
| VM4 | - | 192.168.56.140 |

VM1과 VM3를 서로 다른 네트워크 대역에 배치하고 VM2를 게이트웨이로 구성하여 공격 트래픽이 방화벽 및 IDS를 경유하도록 설계하였다.

<img width="2813" height="1428" alt="통합 아키텍처 구성도" src="https://github.com/user-attachments/assets/0d75c0b5-f70b-4d53-8c64-134f059a53bc" />

## 3. 기술 스택

| 분류 | 사용 기술 |
|---|---|
| Virtualization | Oracle VirtualBox |
| Operating System | Kali Linux, Ubuntu Server |
| Firewall | iptables |
| Intrusion Detection | Snort |
| Automated Blocking | Fail2ban |
| Host Auditing | auditd |
| System Logging | rsyslog |
| Log Collection | Fluent Bit |
| Log Normalization | Python |
| Database | MariaDB |
| Backend | Django, Django REST Framework |
| Frontend | React, TypeScript, Vite |
| Container | Docker, Docker Compose |
| Remote Response | SSH, HMAC, Python |
| Version Control | Git, GitHub |

## 4. 주요 구현 기능

### 4.1. 네트워크 분리 및 방화벽

- 공격망과 서비스망 분리
- Linux IP Forwarding 기반 라우팅
- iptables 기반 패킷 필터링
- 방화벽 이벤트 로깅

### 4.2. 위협 탐지 및 차단

- Snort 기반 네트워크 침입 탐지
- Fail2ban 기반 반복적인 인증 실패 탐지 및 차단
- auditd 기반 호스트 명령어 실행 기록
- DVWA 기반 웹 취약점 공격 재현

### 4.3. 중앙 로그 수집 및 정규화

- Fluent Bit 기반 분산 로그 수집
- iptables, Snort, Apache, MariaDB, auditd 로그 처리
- Python 기반 이기종 로그 파싱 및 정규화
- 보안 이벤트 심각도 분류
- MariaDB 기반 이벤트 저장

### 4.4. 통합 보안관제 대시보드

- 보안 이벤트 현황 시각화
- 이벤트 목록 및 상세 정보 조회
- 공격 유형 및 심각도 분석
- IP 주소 기반 이벤트 시각화
- 사용자 및 관리자 권한 관리
- 대응 요청 및 처리 이력 관리

### 4.5. 관리자 승인 기반 원격 대응

- 보안 이벤트 기반 차단 요청
- 관리자 승인 및 반려
- HMAC 기반 대응 요청 무결성 검증
- SSH 기반 VM2 원격 연동
- iptables 차단 정책 적용
- 대응 실행 결과 기록

## 5. 시스템 동작 흐름

### 공격 트래픽 흐름

```text
VM1 (Attacker)
      |
      v
VM2 (Firewall / IDS)
      |
      v
VM3 (Target Server)
```

### 로그 수집 및 분석 흐름

```text
VM2 (Firewall / IDS / Host Logs) ----+
                                     |
VM3 (Web / Database / Host Logs) -----+
                                     |
                                     v
                              VM4 (Fluent Bit)
                                     |
                                     v
                              Log Normalizer
                                     |
                                     v
                                 DB Loader
                                     |
                                     v
                                  MariaDB
                                     |
                                     v
                                Django API
                                     |
                                     v
                              SOC Dashboard
```

### 보안 대응 흐름

```text
SOC Dashboard
      |
      v
차단 요청
      |
      v
관리자 승인
      |
      v
HMAC 기반 요청 검증 및 SSH 전송
      |
      v
VM2 Firewall Agent
      |
      v
iptables 차단 정책 적용
      |
      v
대응 결과 기록
```

## 6. 저장소 구조

```text
soc-mini/
├── VM1/
│   ├── etc/
│   └── README.md
├── VM2/
│   ├── etc/
│   ├── opt/
│   └── README.md
├── VM3/
│   ├── etc/
│   ├── home/
│   └── README.md
├── VM4/
│   ├── etc/
│   ├── home/
│   └── README.md
└── README.md
```

각 VM 디렉터리에는 주요 설정 파일, 소스코드, 환경 구성 정보 및 개별 구축 가이드가 포함되어 있다.

## 7. 환경 구축 가이드

### 사전 준비

- Oracle VirtualBox 설치
- Kali Linux 및 Ubuntu Server 설치 이미지 준비
- NAT Network, Internal Network, Host-only Network 구성
- 각 VM의 네트워크 인터페이스 및 IP 주소 설정

### 권장 구축 순서

| 순서 | 구성 요소 | 주요 작업 |
|---|---|---|
| 1 | VM2 | 네트워크 라우팅 및 방화벽 구성 |
| 2 | VM4 | 중앙 로그 수집 및 관제 시스템 구축 |
| 3 | VM3 | 웹 서비스 및 로그 전송 환경 구축 |
| 4 | VM1 | 공격 테스트 환경 구축 |
| 5 | 통합 검증 | 탐지, 로그 수집, 시각화 및 대응 기능 확인 |

### VM별 상세 구축 가이드

- [VM1 - Attacker](./VM1/README.md)
- [VM2 - Firewall & IDS](./VM2/README.md)
- [VM3 - Target Server](./VM3/README.md)
- [VM4 - SOC System](./VM4/README.md)

## 8. 주요 서비스 접속 정보

| 서비스 | 접속 주소 |
|---|---|
| DVWA | http://192.168.56.130:4280 |
| SOC Dashboard | http://192.168.56.140:5173 |
| Fluent Bit Collector | 192.168.56.140:24224 |

## 9. 보안 및 참고 사항

- 본 프로젝트는 교육 목적의 가상 보안 실습 환경을 대상으로 한다.
- 공격 테스트는 허가된 실습 환경에서만 수행한다.
- SSH 개인키, HMAC 서명키, 실제 환경변수 파일 및 민감정보는 제출 대상에서 제외한다.
- 시스템 구축 시 필요한 인증정보와 환경변수는 별도로 설정해야 한다.
- 본 저장소는 주요 설정 파일 및 소스코드를 제공하며, 가상머신 전체 이미지나 완전한 시스템 백업을 제공하지 않는다.
- 각 구성 요소의 설치 및 세부 설정은 VM별 README.md를 참고한다.

## 10. 향후 개선 방향

- 방화벽 차단 정책의 영속성 및 해제 기능 개선
- 대응 실패 시 재처리 및 상태 동기화
- 로그 정규화 및 탐지 규칙 확대
- 보안 이벤트 상관분석 고도화
- 외부 위협 인텔리전스 연동
- 시스템 구축 및 배포 자동화
