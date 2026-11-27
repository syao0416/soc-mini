# VM1 - Attacker

## 1. 개요

VM1은 Kali Linux 기반의 공격 테스트 환경이다. VM3를 대상으로 공격을 재현하고 VM2의 탐지 및 차단 기능과 VM4의 보안관제 기능을 검증하기 위해 구성하였다.

## 2. 시스템 구성

| 항목 | 설정 |
|---|---|
| OS | Kali GNU/Linux Rolling 2025.2 |
| Hypervisor | Oracle VirtualBox |
| Network Adapter | Internal Network |
| Interface | eth0 |
| IP Address | 192.168.10.110 |
| Subnet Mask | 255.255.255.0 (/24) |
| Default Gateway | 192.168.10.120 (VM2) |
| DNS | 8.8.8.8, 8.8.4.4 |

## 3. 디렉터리 구조

```text
VM1/
├── etc/
│   ├── network/
│   │   └── interfaces
│   └── NetworkManager/
│       └── NetworkManager.conf
├── network-addresses.txt
├── network-routes.txt
├── os-release.txt
├── packages.txt
└── README.md
```

## 4. 환경 구축 방법

### 4.1. Kali Linux 설치

Kali Linux 공식 홈페이지에서 설치 이미지 또는 VirtualBox용 가상머신 이미지를 다운로드한다.

- https://www.kali.org/get-kali/

### 4.2. VirtualBox 네트워크 설정

1. VM1의 네트워크 어댑터를 활성화한다.
2. 연결 방식을 Internal Network로 설정한다.
3. 내부 네트워크 이름을 VM2의 공격망 인터페이스와 동일하게 지정한다.

### 4.3. 네트워크 설정 파일 적용

제공된 설정 파일을 다음 경로에 반영한다.

- `/etc/network/interfaces`
- `/etc/NetworkManager/NetworkManager.conf`

본 환경은 ifupdown 방식으로 네트워크를 관리하며, NetworkManager의 `managed=false` 설정을 통해 `/etc/network/interfaces`에 정의된 인터페이스를 NetworkManager의 관리 대상에서 제외한다.

설정 적용 전 실제 네트워크 인터페이스 이름이 eth0인지 확인한다.

설정 적용 후 가상머신을 재부팅한다.

### 4.4. 네트워크 연결 확인

```bash
ip -br addr
ip route
ping -c 3 192.168.10.120
ping -c 3 192.168.56.130
```

VM3와의 통신은 VM2의 IP Forwarding 및 방화벽 정책에 따라 달라질 수 있다.

## 5. 네트워크 구성

```text
VM1 (Attacker)
192.168.10.110/24
        |
        v
VM2 (Firewall-IDS)
192.168.10.120/24
192.168.56.120/24
        |
        v
VM3 (Target-Server)
192.168.56.130/24
```

VM1과 VM3를 서로 다른 네트워크 대역에 배치하여 공격 트래픽이 VM2를 경유하도록 구성하였다.

## 6. 주요 역할

- 웹 취약점 공격 재현
- 네트워크 공격 재현
- 방화벽 및 IDS 탐지 기능 검증
- 방화벽 차단 정책 검증
- VM4 보안관제 시스템의 이벤트 수집 및 시각화 검증

## 7. 참고 사항

- 설치된 패키지 목록은 packages.txt를 참고한다.
- packages.txt는 실습 환경의 구성 기록이며, 모든 패키지를 별도로 설치할 필요는 없다.
- 운영체제 이미지, 개인 파일, 명령어 실행 이력 및 프로젝트와 무관한 실습 파일은 제출 대상에서 제외하였다.
- 모든 공격 테스트는 허가된 프로젝트 실습 환경에서만 수행한다.
