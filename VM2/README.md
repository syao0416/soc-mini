# VM2 - Firewall & IDS

## 1. 개요

VM2는 공격자(VM1)와 보호 대상 서버(VM3) 사이에서 게이트웨이 역할을 수행하며, 네트워크 트래픽 탐지 및 차단을 담당한다.

보안 솔루션에서 발생한 로그를 Fluent Bit를 통해 VM4(SOC-System)로 전송하며, SOC 관리자의 승인에 따른 원격 IP 차단 기능을 제공한다.

## 2. 주요 구성 요소

| 구성 요소 | 역할 |
|---|---|
| Ubuntu Server 24.04 LTS | 운영체제 |
| iptables | 네트워크 트래픽 제어 및 로깅 |
| Snort | 시그니처 기반 침입 탐지 |
| Fail2ban | 로그 기반 반복 공격 탐지 및 차단 |
| auditd | 시스템 감사 로그 생성 |
| rsyslog | 시스템 및 방화벽 로그 처리 |
| Fluent Bit | 로그 수집 및 VM4 전송 |
| OpenSSH | SOC 서버의 원격 차단 요청 전달 |
| Python 3 | 원격 차단 에이전트 실행 |

## 3. 디렉터리 구조

```text
VM2/
├── etc/
│   ├── audit/
│   ├── fail2ban/
│   ├── fluent-bit/
│   ├── iptables/
│   ├── netplan/
│   ├── rsyslog.d/
│   ├── snort/
│   ├── sudoers.d/
│   └── sysctl.conf
├── opt/
│   └── soc-agent/
│       ├── remote_apply.sh
│       └── vm2_agent.py
├── ip-forwarding.txt
├── network-addresses.txt
├── network-routes.txt
├── packages.txt
├── services.txt
└── README.md
```

각 디렉터리는 실제 VM2의 리눅스 파일시스템 경로를 기준으로 구성하였다.

## 4. 네트워크 구성

VM2는 다음 세 가지 네트워크에 연결된다.

- NAT Network: 외부 네트워크 통신
- Internal Network: VM1과의 통신
- Host-only Network: VM3 및 VM4와의 통신

상세 IP 주소 및 네트워크 어댑터 설정은 프로젝트 최상위 README.md를 참고한다.

현재 네트워크 설정은 다음 명령어로 확인할 수 있다.

```bash
ip -br addr
ip route
```

IP Forwarding 활성화 여부를 확인한다.

```bash
sysctl net.ipv4.ip_forward
```

정상 설정값은 다음과 같다.

```text
net.ipv4.ip_forward = 1
```

## 5. 환경 구축

Ubuntu Server 24.04 LTS 설치 후 필요한 패키지를 설치한다.

```bash
sudo apt update

sudo apt install -y \
  iptables \
  iptables-persistent \
  snort \
  fail2ban \
  auditd \
  rsyslog \
  openssh-server \
  python3
```

Fluent Bit은 공식 패키지 저장소를 이용하여 별도로 설치한다.

설치된 패키지의 버전은 packages.txt를 참고한다.

제출된 설정 파일을 참고하여 각 솔루션의 설정을 적용한다. 기존 시스템 설정을 백업하고 네트워크 인터페이스명 및 IP 주소가 실제 환경과 일치하는지 확인한 후 적용한다.

## 6. 서비스 실행 및 확인

### 6.1 iptables

```bash
sudo iptables -S
sudo iptables -L -n -v
```

- rules.v4: 영구 저장된 IPv4 방화벽 정책
- rules.v6: 영구 저장된 IPv6 방화벽 정책
- current.rules: 제출 시점의 IPv4 방화벽 정책

### 6.2 Snort

```bash
sudo systemctl restart snort
sudo systemctl status snort
```

사용자 정의 탐지 규칙:

```text
/etc/snort/rules/local.rules
```

### 6.3 Fail2ban

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status
sudo fail2ban-client status dvwa-login
```

사용자 정의 설정:

```text
/etc/fail2ban/filter.d/dvwa-login.conf
/etc/fail2ban/jail.d/dvwa-login.local
```

### 6.4 auditd

```bash
sudo augenrules --load
sudo auditctl -l
sudo systemctl status auditd
```

사용자 정의 감사 규칙:

```text
/etc/audit/rules.d/50-soc-exec.rules
```

### 6.5 rsyslog

```bash
sudo systemctl restart rsyslog
sudo systemctl status rsyslog
```

방화벽 로그 확인:

```bash
sudo tail -f /var/log/iptables.log
```

### 6.6 Fluent Bit

```bash
sudo systemctl restart fluent-bit
sudo systemctl status fluent-bit
```

수집된 보안 로그는 VM4의 Fluent Bit 수집기로 전송된다.

```text
192.168.56.140:24224/TCP
```

## 7. 원격 IP 차단 기능

VM4의 SOC 대시보드에서 관리자가 차단 요청을 승인하면 SSH를 통해 VM2의 원격 차단 에이전트가 실행된다.

```text
SOC Dashboard
    ↓
관리자 승인
    ↓
SSH 원격 요청
    ↓
remote_apply.sh
    ↓
vm2_agent.py
    ↓
iptables SOC_BLOCK
```

원격 차단 기능에는 다음 보안 통제가 적용된다.

- SSH 공개키 기반 인증
- 접속 출발지 IP 제한
- SSH Forced Command
- sudo 실행 권한 제한
- HMAC 기반 요청 무결성 검증
- 보호 대상 IP 차단 제한
- 요청 유효시간 및 중복 실행 검증

차단 정책 확인:

```bash
sudo iptables -S SOC_BLOCK
sudo iptables -L SOC_BLOCK -n -v
```

SOC_BLOCK 체인은 원격 차단 요청이 처리될 때 동적으로 생성된다.

## 8. 보안 및 유의사항

SSH 개인키, HMAC 서명 키, 인증 정보 및 실제 로그 데이터는 제출 파일에 포함하지 않는다.

원격 차단 기능을 새롭게 구축하는 경우 VM4와 연동되는 SSH 인증 및 HMAC 키를 별도로 설정해야 한다.

제출된 파일은 프로젝트 소스코드 및 설정 파일이며, 운영체제 전체 백업이나 즉시 실행 가능한 가상머신 이미지는 아니다.

현재 저장된 방화벽 정책은 제출 시점의 정책을 기준으로 하며, 동적으로 생성되는 차단 정책은 포함하지 않을 수 있다.
