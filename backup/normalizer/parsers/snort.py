
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_snort(raw_log):
    
    pattern = (
        r"(?P<timestamp>\d{2}/\d{2}-\d{2}:\d{2}:\d{2}\.\d+)"
        r"\s+\[\*\*\]\s+"
        r"\[(?P<rule_id>[\d:]+)\]\s+"
        r"(?P<message>.*?)\s+"
        r"\[\*\*\]\s+"
        r"(?:\[Classification:\s*(?P<classification>.*?)\]\s+)?"
        r"\[Priority:\s*(?P<priority>\d+)\]\s+"
        r"\{(?P<protocol>[^}]+)\}\s+"
        r"(?P<src_ip>\S+)\s+->\s+"
        r"(?P<dst_ip>\S+)"
    )


    match = re.search(pattern, raw_log)

    if not match:
        return None

    data = match.groupdict()

    try:
        priority = int(data["priority"])

        current_year = datetime.now().year

        timestamp = datetime.strptime(
            f"{current_year}/{data['timestamp']}",
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

    return normalize_log(
        timestamp=timestamp,
        source_vm="VM2",
        log_type="snort",
        event_type="intrusion_detection",
        severity=severity,
        src_ip=data["src_ip"],
        dst_ip=data["dst_ip"],
        protocol=data["protocol"],
        message=data["message"],
        raw=raw_log.strip(),

        # Snort 상세 필드
        signature_id=data["rule_id"],
        classification=data.get("classification"),
        priority=priority
    )
