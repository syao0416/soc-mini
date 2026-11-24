
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_dvwa(raw_log):
    pattern = (
        r'(?P<src_ip>\S+)\s+'
        r'\S+\s+'
        r'\S+\s+'
        r'\[(?P<timestamp>[^\]]+)\]\s+'
        r'"(?P<method>\S+)\s+'
        r'(?P<path>\S+)\s+'
        r'(?P<http_version>[^"]+)"\s+'
        r'(?P<status>\d{3})\s+'
        r'(?P<size>\S+)\s+'
        r'"(?P<referer>[^"]*)"\s+'
        r'"(?P<user_agent>[^"]*)"'
    )

    match = re.search(pattern, raw_log)

    if not match:
        return None

    data = match.groupdict()

    try:
        timestamp = datetime.strptime(
            data["timestamp"],
            "%d/%b/%Y:%H:%M:%S %z"
        ).isoformat()

        status = int(data["status"])

        response_size = (
            int(data["size"])
            if data["size"].isdigit()
            else None
        )

    except (ValueError, TypeError):
        return None

    return normalize_log(
        timestamp=timestamp,
        source_vm="VM3",
        log_type="dvwa",
        event_type="http_request",
        severity="info",
        src_ip=data["src_ip"],
        dst_ip=None,
        protocol="HTTP",
        message=(
            f'{data["method"]} {data["path"]} '
            f'Status={status}'
        ),
        raw=raw_log.strip(),

        # DVWA 상세 필드
        http_method=data["method"],
        http_path=data["path"],
        http_version=data["http_version"],
        http_status=status,
        response_size=response_size,
        referer=(
            data["referer"]
            if data["referer"] != "-"
            else None
        ),
        user_agent=data["user_agent"]
    )
