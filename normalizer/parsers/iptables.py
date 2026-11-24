
import re

from normalizer.normalizer import normalize_log


def parse_iptables(raw_log):

    raw_log = raw_log.strip()

    pattern = (
        r"^(?P<timestamp>\S+)"
        r"\s+\S+\s+kernel:\s+IPTABLES:\s+"
        r"(?P<details>.*)$"
    )

    match = re.match(pattern, raw_log)

    if not match:
        return None

    # KEY=VALUE 추출
    fields = {}

    for key, value in re.findall(
        r"\b([A-Z][A-Z0-9_]*)=(\S*)",
        match.group("details")
    ):
        fields.setdefault(key, value or None)

    if not fields.get("SRC") or not fields.get("DST"):
        return None

    # 숫자 데이터 변환
    def number(key):
        value = fields.get(key)
        return int(value) if value is not None else None

    protocol = fields.get("PROTO")

    return normalize_log(
        timestamp=match.group("timestamp"),
        source_vm="VM2",
        log_type="iptables",
        event_type="firewall_packet",
        severity="info",

        src_ip=fields["SRC"],
        dst_ip=fields["DST"],
        src_port=number("SPT"),
        dst_port=number("DPT"),
        protocol=protocol,

        message=f'{protocol or "미확인"} 패킷 기록',
        raw=raw_log,

        interface_in=fields.get("IN"),
        interface_out=fields.get("OUT"),
        packet_length=number("LEN"),
        ttl=number("TTL"),
        icmp_type=number("TYPE"),
        icmp_code=number("CODE"),
        icmp_sequence=number("SEQ")
    )
