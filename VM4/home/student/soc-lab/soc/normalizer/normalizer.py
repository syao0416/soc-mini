
import ipaddress
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from normalizer.severity import classify_severity


# 시간대 설정
KST = timezone(timedelta(hours=9))

SOURCE_TZ = {
    "snort": KST,
    "iptables": timezone.utc,
    "dvwa": timezone.utc,
    "mariadb": timezone.utc,
    "auditd": timezone.utc 
}


# 이벤트 대분류
EVENT_CATEGORIES = {
    "snort": "intrusion_detection",
    "iptables": "network_traffic",
    "dvwa": "web_service",
    "mariadb": "database",
    "auditd": "host_activity"
}


# 세부 이벤트 유형
EVENTS = {
    "intrusion_detection": "intrusion_detection",
    "firewall_packet": "firewall_packet",
    "http_request": "http_request",
    "http_timeout": "http_timeout",
    "http_client_error": "http_client_error",
    "http_server_error": "http_server_error",
    "apache_system_event": "apache_system_event",
    "database_event": "database_event",
    "database_startup": "database_startup",
    "database_system_warning": "database_system_warning",
    "authentication_failure": "authentication_failure",
    "command_execution": "command_execution",
    "ip_ban": "ip_ban",
    "ip_unban": "ip_unban"
}


# 서비스 자산 정보
ASSETS = {
    "dvwa": {
        "ip": "192.168.56.130",
        "port": 4280
    }
}


# 로그 유형별 상세정보 스키마
DETAIL_SCHEMAS = {

    "snort": {
        "signature_id": "signature_id",
        "classification": "classification",
        "priority": "priority"
    },

    "iptables": {
        "interface_in": "interface_in",
        "interface_out": "interface_out",
        "packet_length": "packet_length",
        "ttl": "ttl",
        "icmp_type": "icmp_type",
        "icmp_code": "icmp_code",
        "icmp_sequence": "icmp_sequence",
        "action": "action"
    },

    "dvwa": {
        "http_method": "http_method",
        "http_path": "http_path",
        "http_version": "http_version",
        "http_status": "http_status",
        "response_size": "response_size",
        "referer": "referer",
        "user_agent": "user_agent",
        "apache_module": "apache_module",
        "apache_level": "apache_level"
    },

    "mariadb": {
        "thread_id": "thread_id",
        "database_level": "database_level",
        "db_user": "db_user",
        "client_host": "client_host"
    },

    "auditd": {
        "audit_event_id": "audit_event_id",
        "audit_key": "audit_key",
        "command": "command",
        "arguments": "arguments",
        "argument_count": "argument_count",
        "arguments_complete": "arguments_complete",
        "executable": "executable",
        "cwd": "cwd",
        "auid": "auid",
        "uid": "uid",
        "euid": "euid",
        "pid": "pid",
        "ppid": "ppid",
        "session_id": "session_id",
        "tty": "tty",
        "success": "success",
        "syscall_exit": "syscall_exit",
        "response_tool": "response_tool",
        "action": "action",
        "jail": "jail",
        "chain": "chain",
        "target_ip": "target_ip",
        "netfilter_operation": "netfilter_operation"
    }
}


# 한국 표준시 변환
def to_kst(timestamp, log_type):

    if timestamp is None:
        return None

    dt = datetime.fromisoformat(timestamp)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SOURCE_TZ[log_type])

    return dt.astimezone(KST).isoformat(
        timespec="microseconds"
    )


# IP 주소 표준화
def clean_ip(value):

    if not value:
        return None

    try:
        return str(ipaddress.ip_address(value))

    except (ValueError, TypeError):
        return None


# 포트 자료형 및 범위 검증
def clean_port(value):

    if value is None:
        return None

    try:
        port = int(value)

        if 0 <= port <= 65535:
            return port

    except (ValueError, TypeError):
        pass

    return None


# 공통 로그 정규화
def normalize_log(
    source_vm,
    log_type,
    event_type=None,
    severity="info",
    src_ip=None,
    dst_ip=None,
    protocol=None,
    message=None,
    raw=None,
    timestamp=None,
    src_port=None,
    dst_port=None,
    **extra_fields
):

    if log_type not in DETAIL_SCHEMAS:
        raise ValueError(f"Unsupported log type: {log_type}")

    if event_type not in EVENTS:
        raise ValueError(f"Unsupported event type: {event_type}")

    event_time = to_kst(timestamp, log_type)

    time_source = (
        "raw_log"
        if event_time is not None
        else None
    )

    if log_type == "snort" and event_time:
        time_source = "raw_log_inferred_year"

    destination_source = (
        "raw_log"
        if dst_ip is not None or dst_port is not None
        else None
    )

    # DVWA 서비스 자산 정보 보완
    if log_type == "dvwa" and protocol == "HTTP":

        if dst_ip is None and dst_port is None:

            dst_ip = ASSETS["dvwa"]["ip"]
            dst_port = ASSETS["dvwa"]["port"]

            destination_source = "asset_config"


    # MariaDB 클라이언트 주소 처리
    if log_type == "mariadb":

        src_ip = src_ip or extra_fields.get("client_host")

        # 실제 네트워크 프로토콜은 원본에서 확인 불가
        protocol = None


    # 프로토콜에 따른 포트 처리
    if protocol and "ICMP" in protocol.upper():
        src_port = None
        dst_port = None


    # 동일 로그 유형의 상세정보 필드 통일
    details = {
        korean_name: extra_fields.get(original_name)

        for original_name, korean_name
        in DETAIL_SCHEMAS[log_type].items()
    }


    # 심각도 중앙 판정
    severity_result = classify_severity(
        log_type=log_type,
        event_type=event_type,
        message=message,
        details=extra_fields
    )


    return {

        "schema_version": "3.0",
        "event_id": str(uuid4()),

        "timestamp": event_time,
        "timestamp_source": time_source,
        "log_timestamp": None,
        "forward_timestamp": None,

        "normalized_at": datetime.now(KST).isoformat(
            timespec="microseconds"
        ),

        "source_vm": source_vm,
        "tag": None,

        "log_type": log_type,
        "event_category": (
            "security_response"
            if event_type in ("ip_ban", "ip_unban")
            else EVENT_CATEGORIES[log_type]
        ),
        "event_type": EVENTS[event_type],

        **severity_result,

        "src_ip": clean_ip(src_ip),
        "src_port": clean_port(src_port),

        "dst_ip": clean_ip(dst_ip),
        "dst_port": clean_port(dst_port),
        "destination_source": destination_source,

        "protocol": protocol.upper() if protocol else None,

        "message": message,
        "details": details,
        "raw": raw
    }
