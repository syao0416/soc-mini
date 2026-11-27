
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_mariadb(raw_log):

    raw_log = raw_log.strip()

    # 일반 MariaDB 로그
    pattern = (
        r"^(?P<timestamp>\d{4}-\d{2}-\d{2}\s+"
        r"\d{1,2}:\d{2}:\d{2})\s+"
        r"(?P<thread_id>\d+)\s+"
        r"\[(?P<level>\w+)\]\s+"
        r"(?P<message>.*)$"
    )

    match = re.match(pattern, raw_log)

    timestamp = None
    thread_id = None
    level = "Note"
    message = raw_log
    event_type = "database_event"

    if match:

        data = match.groupdict()

        try:
            timestamp = datetime.strptime(
                data["timestamp"],
                "%Y-%m-%d %H:%M:%S"
            ).isoformat()

        except ValueError:
            return None

        thread_id = int(data["thread_id"])
        level = data["level"]
        message = data["message"]

    else:

        # Docker Entrypoint 로그
        pattern = (
            r"^(?P<timestamp>\d{4}-\d{2}-\d{2}\s+"
            r"\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\s+"
            r"\[(?P<level>\w+)\]\s+"
            r"\[Entrypoint\]:\s+"
            r"(?P<message>.*)$"
        )

        match = re.match(pattern, raw_log)

        if match:

            data = match.groupdict()

            try:
                timestamp = datetime.fromisoformat(
                    data["timestamp"]
                ).isoformat()
            except ValueError:
                return None

            level = data["level"]
            message = data["message"]
            event_type = "database_startup"

        elif raw_log.startswith("Version:") and "MariaDB" in raw_log:
            event_type = "database_startup"

        elif raw_log.startswith("create_uring failed"):
            event_type = "database_system_warning"
            level = "Warning"

        else:
            return None

    severity_map = {
        "note": "info",
        "info": "info",
        "warn": "medium",
        "warning": "medium",
        "error": "high"
    }

    severity = severity_map.get(level.lower(), "info")

    extra_fields = {
        "thread_id": thread_id,
        "database_level": level
    }

    # 인증 실패 이벤트
    auth_match = re.search(
        r"Access denied for user '([^']+)'@'([^']+)'",
        message
    )

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
        protocol="MariaDB",
        message=message,
        raw=raw_log,
        **extra_fields
    )
