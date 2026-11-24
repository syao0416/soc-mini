
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_iptables(raw_log):
    pattern = (
        r"(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+\+\d{2}:\d{2})"
        r"\s+\S+\s+kernel:\s+IPTABLES:\s+"
        r"(?P<details>.*)"
    )

    match = re.search(pattern, raw_log)

    if not match:
        return None

    details = match.group("details")

    fields = dict(
        re.findall(r"(\w+)=([^\s]+)", details)
    )

    if "SRC" not in fields or "DST" not in fields:
        return None

    try:
        timestamp = datetime.fromisoformat(
            match.group("timestamp")
        ).isoformat()

        packet_length = int(fields["LEN"]) if "LEN" in fields else None
        ttl = int(fields["TTL"]) if "TTL" in fields else None
        icmp_type = int(fields["TYPE"]) if "TYPE" in fields else None
        icmp_code = int(fields["CODE"]) if "CODE" in fields else None
        icmp_sequence = int(fields["SEQ"]) if "SEQ" in fields else None

    except ValueError:
        return None

    protocol = fields.get("PROTO")

    return normalize_log(
        timestamp=timestamp,
        source_vm="VM2",
        log_type="iptables",
        event_type="firewall_packet",
        severity="info",
        src_ip=fields.get("SRC"),
        dst_ip=fields.get("DST"),
        protocol=protocol,
        message=details,
        raw=raw_log.strip(),

        # iptables 상세 필드
        interface_in=fields.get("IN"),
        interface_out=fields.get("OUT"),
        packet_length=packet_length,
        ttl=ttl,
        icmp_type=icmp_type,
        icmp_code=icmp_code,
        icmp_sequence=icmp_sequence
    )
