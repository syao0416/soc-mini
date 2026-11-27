
import re
from datetime import datetime

from normalizer.normalizer import normalize_log


def parse_dvwa(raw_log):

    raw_log = raw_log.strip()

    # Apache Access Log
    pattern = (
        r'^(?P<src_ip>\S+)\s+'
        r'\S+\s+\S+\s+'
        r'\[(?P<timestamp>[^\]]+)\]\s+'
        r'"(?P<request>[^"]*)"\s+'
        r'(?P<status>\d{3})\s+'
        r'(?P<size>\S+)\s+'
        r'"(?P<referer>[^"]*)"\s+'
        r'"(?P<user_agent>[^"]*)"$'
    )

    match = re.match(pattern, raw_log)

    if match:

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

        except ValueError:
            return None

        method = None
        path = None
        http_version = None

        request = data["request"]

        if request != "-":
            parts = request.split()

            if len(parts) == 3:
                method, path, http_version = parts

        severity = "info"
        event_type = "http_request"

        if status >= 500:
            severity = "medium"
            event_type = "http_server_error"

        elif status == 408:
            event_type = "http_timeout"

        elif status >= 400:
            event_type = "http_client_error"

        return normalize_log(
            timestamp=timestamp,
            source_vm="VM3",
            log_type="dvwa",
            event_type=event_type,
            severity=severity,
            src_ip=data["src_ip"],
            protocol="HTTP",
            message=f"{request} Status={status}",
            raw=raw_log,
            http_method=method,
            http_path=path,
            http_version=http_version,
            http_status=status,
            response_size=response_size,
            referer=(
                data["referer"]
                if data["referer"] != "-"
                else None
            ),
            user_agent=(
                data["user_agent"]
                if data["user_agent"] != "-"
                else None
            )
        )

    # Apache Error / System Log
    pattern = (
        r"^\[(?P<timestamp>[^\]]+)\]\s+"
        r"\[(?P<module>[^:\]]+):(?P<level>[^\]]+)\]\s+"
        r"(?P<message>.*)$"
    )

    match = re.match(pattern, raw_log)

    if match:

        data = match.groupdict()

        try:
            timestamp = datetime.strptime(
                data["timestamp"],
                "%a %b %d %H:%M:%S.%f %Y"
            ).isoformat()
        except ValueError:
            return None

        level = data["level"].lower()

        severity_map = {
            "notice": "info",
            "warn": "medium",
            "error": "high",
            "crit": "critical",
            "alert": "critical",
            "emerg": "critical"
        }

        return normalize_log(
            timestamp=timestamp,
            source_vm="VM3",
            log_type="dvwa",
            event_type="apache_system_event",
            severity=severity_map.get(level, "info"),
            message=data["message"],
            raw=raw_log,
            apache_module=data["module"],
            apache_level=level
        )

    # Apache 시작 경고
    if re.match(r"^AH\d{5}:", raw_log):
        return normalize_log(
            source_vm="VM3",
            log_type="dvwa",
            event_type="apache_system_event",
            severity="medium",
            message=raw_log,
            raw=raw_log
        )

    return None
