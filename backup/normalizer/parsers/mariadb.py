
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_mariadb(raw_log):
    pattern = (
        r"(?P<timestamp>\d{4}-\d{2}-\d{2}\s+"
        r"\d{1,2}:\d{2}:\d{2})\s+"
        r"(?P<thread_id>\d+)\s+"
        r"\[(?P<level>\w+)\]\s+"
        r"(?P<message>.*)"
    )

    match = re.search(pattern, raw_log.strip())

    if not match:
        return None

    data = match.groupdict()

    try:
        timestamp = datetime.strptime(
            data["timestamp"],
            "%Y-%m-%d %H:%M:%S"
        ).isoformat()

    except ValueError:
        return None

    level = data["level"].lower()
    message = data["message"]

    # 기본 이벤트 분류
    event_type = "database_event"
    severity = "info"

    if level == "warning":
        severity = "medium"
    elif level == "error":
        severity = "high"

    # 인증 실패 이벤트
    auth_match = re.search(
        r"Access denied for user '([^']+)'@'([^']+)'",
        message
    )

    extra_fields = {
        "thread_id": int(data["thread_id"]),
        "database_level": data["level"]
    }

    if auth_match:
        event_type = "authentication_failure"
        severity = "high"

        extra_fields.update({
            "db_user": auth_match.group(1),
            "client_host": auth_match.group(2)
        })

    return normalize_log(
        timestamp=timestamp,
        source_vm="VM3",
        log_type="mariadb",
        event_type=event_type,
        severity=severity,
        src_ip=None,
        dst_ip=None,
        protocol="MariaDB",
        message=message,
        raw=raw_log.strip(),
        **extra_fields
    )
