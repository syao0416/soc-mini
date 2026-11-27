import ipaddress

from .models import SocConfiguration

# Safety baseline for PREVIEW only. VM2 must independently enforce its own
# management/allow rules before any future firewall execution is permitted.
IMMUTABLE_PROTECTED = (
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('::1/128'),
    ipaddress.ip_network('169.254.0.0/16'),
    ipaddress.ip_network('fe80::/10'),
    ipaddress.ip_network('192.168.56.140/32'),  # Team VM4 known SOC collector
)


def is_eligible_for_block(target_ip):
    """Check REVIEW eligibility only; NEVER execute a firewall command."""
    try:
        address = ipaddress.ip_address(target_ip)
    except ValueError:
        return False, 'IP 주소 형식이 올바르지 않습니다.'
    if address.is_loopback or address.is_unspecified or address.is_multicast or address.is_link_local:
        return False, '루프백·멀티캐스트·링크 로컬 주소는 차단할 수 없습니다.'
    config = SocConfiguration.objects.filter(pk=1).first()
    custom = config.protected_networks if config else SocConfiguration().protected_networks
    networks = list(IMMUTABLE_PROTECTED)
    for value in custom.splitlines():
        value = value.strip()
        if value:
            try:
                networks.append(ipaddress.ip_network(value, strict=False))
            except ValueError:
                return False, '보호 IP 정책 설정에 잘못된 네트워크가 있습니다.'
    for network in networks:
        if address in network:
            return False, f'{network}은 보호 대역으로 지정되어 있습니다.'
    return True, '차단 검토 요청이 가능한 IP입니다. 실제 방화벽 차단은 실행되지 않습니다.'
