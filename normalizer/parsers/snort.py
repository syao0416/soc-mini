
import re
import ipaddress
from datetime import datetime

from normalizer.normalizer import normalize_log


def split_endpoint(endpoint):

    # 포트가 없는 IPv4 또는 IPv6
    try:
        ipaddress.ip_address(endpoint)
        return endpoint, None
    except ValueError:
        pass

    # 대괄호로 구분된 IPv6 + 포트
    match = re.fullmatch(
        r"\[([^\]]+)\]:(\d+)",
        endpoint
    )

    if match:
        return match.group(1), int(match.group(2))

    # IPv4 + 포트
    if endpoint.count(":") == 1:

        host, port = endpoint.rsplit(":", 1)

        try:
            ipaddress.ip_address(host)

            if port.isdigit():
                return host, int(port)

        except ValueError:
            pass

    return endpoint, None


def parse_snort(raw_log):

    pattern = (
        r"(?P<timestamp>\d{2}/\d{2}-"
        r"\d{2}:\d{2}:\d{2}\.\d+)"
        r"\s+\[\*\*\]\s+"
        r"\[(?P<rule_id>[\d:]+)\]\s+"
        r"(?P<message>.*?)\s+"
        r"\[\*\*\]\s+"
        r"(?:\[Classification:\s*"
        r"(?P<classification>.*?)\]\s+)?"
        r"\[Priority:\s*(?P<priority>\d+)\]\s+"
        r"\{(?P<protocol>[^}]+)\}\s+"
        r"(?P<src_endpoint>\S+)\s+->\s+"
        r"(?P<dst_endpoint>\S+)"
    )

    match = re.search(pattern, raw_log)

    if not match:
        return None

    data = match.groupdict()

    try:
        priority = int(data["priority"])

        timestamp = datetime.strptime(
            f"{datetime.now().year}/{data['timestamp']}",
            "%Y/%m/%d-%H:%M:%S.%f"
        ).isoformat()

    except ValueError:
        return None

    severity_map = {
        0: "info",
        1: "critical",
        2: "high",
        3: "medium"
    }

    severity = severity_map.get(priority, "low")

    src_ip, src_port = split_endpoint(
        data["src_endpoint"]
    )

    dst_ip, dst_port = split_endpoint(
        data["dst_endpoint"]
    )

    return normalize_log(
        timestamp=timestamp,
        source_vm="VM2",
        log_type="snort",
        event_type="intrusion_detection",
        severity=severity,
        src_ip=src_ip,
        dst_ip=dst_ip,
        protocol=data["protocol"],
        message=data["message"],
        raw=raw_log.strip(),
        signature_id=data["rule_id"],
        classification=data.get("classification"),
        priority=priority,
        src_port=src_port,
        dst_port=dst_port
    )
