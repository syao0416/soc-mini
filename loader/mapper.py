
import json

from datetime import datetime, timezone
from uuid import UUID


# JSON field -> Database column
FIELD_MAP = {

    "event_id": "event_id",
    "schema_version": "schema_version",

    "timestamp": "event_time",
    "timestamp_source": "event_time_source",
    "log_timestamp": "log_recorded_at",
    "forward_timestamp": "forward_event_time",
    "normalized_at": "normalized_at",

    "source_vm": "source_vm",
    "tag": "source_tag",
    "log_type": "log_type",

    "event_category": "event_category",
    "event_type": "event_type",

    "severity": "severity",
    "severity_level": "severity_level",
    "severity_reason": "severity_reason",
    "severity_policy": "severity_policy",

    "src_ip": "src_ip",
    "src_port": "src_port",
    "dst_ip": "dst_ip",
    "dst_port": "dst_port",
    "destination_source": "dst_info_source",
    "protocol": "protocol",

    "message": "message",
    "details": "details",
    "raw": "raw_log"
}


TIME_FIELDS = {

    "event_time",
    "log_recorded_at",
    "forward_event_time",
    "normalized_at"
}


SEVERITY_LEVELS = {

    "info": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4
}


DB_COLUMNS = tuple(FIELD_MAP.values())


# ISO 8601 timestamp -> UTC datetime
def to_utc(value):

    if value is None:
        return None

    dt = datetime.fromisoformat(value)

    if dt.tzinfo is None:
        raise ValueError("Timestamp has no timezone")

    return dt.astimezone(
        timezone.utc
    ).replace(tzinfo=None)


# Normalized JSON -> Database record
def map_event(event):

    if event.get("schema_version") != "3.0":
        raise ValueError(
            "Unsupported schema version"
        )

    missing = set(FIELD_MAP) - set(event)

    if missing:
        raise ValueError(
            f"Missing fields: {sorted(missing)}"
        )

    UUID(event["event_id"])

    severity = event["severity"]
    severity_level = event["severity_level"]

    if (
        severity not in SEVERITY_LEVELS
        or type(severity_level) is not int
        or SEVERITY_LEVELS[severity] != severity_level
    ):
        raise ValueError("Invalid severity")

    if not isinstance(event["details"], dict):
        raise ValueError("Invalid details format")

    if not isinstance(event["raw"], str):
        raise ValueError("Invalid raw log")

    record = {}

    for source, destination in FIELD_MAP.items():

        value = event[source]

        if destination in TIME_FIELDS:
            value = to_utc(value)

        elif destination == "details":

            value = json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":")
            )

        record[destination] = value

    return record
