
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
    "mariadb": timezone.utc
}


# 이벤트 대분류
EVENT_CATEGORIES = {
    "snort": "침입 탐지",
    "iptables": "네트워크 트래픽",
    "dvwa": "웹 서비스",
    "mariadb": "데이터베이스"
}


# 세부 이벤트 유형
EVENTS = {
    "intrusion_detection": "IDS 탐지",
    "firewall_packet": "방화벽 패킷 기록",
    "http_request": "HTTP 요청",
    "http_timeout": "HTTP 요청 시간 초과",
    "http_client_error": "HTTP 클라이언트 오류",
    "http_server_error": "HTTP 서버 오류",
    "apache_system_event": "Apache 시스템 이벤트",
    "database_event": "데이터베이스 이벤트",
    "database_startup": "데이터베이스 시작",
    "database_system_warning": "데이터베이스 시스템 경고",
    "authentication_failure": "인증 실패"
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
        "signature_id": "시그니처ID",
        "classification": "탐지분류",
        "priority": "우선순위"
    },

    "iptables": {
        "interface_in": "입력인터페이스",
        "interface_out": "출력인터페이스",
        "packet_length": "패킷크기",
        "ttl": "TTL",
        "icmp_type": "ICMP유형",
        "icmp_code": "ICMP코드",
        "icmp_sequence": "ICMP순서번호",
        "action": "처리결과"
    },

    "dvwa": {
        "http_method": "HTTP메서드",
        "http_path": "요청경로",
        "http_version": "HTTP버전",
        "http_status": "HTTP상태코드",
        "response_size": "응답크기",
        "referer": "참조URL",
        "user_agent": "사용자에이전트",
        "apache_module": "Apache모듈",
        "apache_level": "Apache로그레벨"
    },

    "mariadb": {
        "thread_id": "스레드ID",
        "database_level": "DB로그레벨",
        "db_user": "DB사용자",
        "client_host": "클라이언트호스트"
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
        raise ValueError(f"지원하지 않는 로그 유형: {log_type}")

    if event_type not in EVENTS:
        raise ValueError(f"지원하지 않는 이벤트 유형: {event_type}")

    event_time = to_kst(timestamp, log_type)

    time_source = (
        "원본로그"
        if event_time is not None
        else None
    )

    if log_type == "snort" and event_time:
        time_source = "원본로그 및 연도추정"

    destination_source = (
        "원본로그"
        if dst_ip is not None or dst_port is not None
        else None
    )

    # DVWA 서비스 자산 정보 보완
    if log_type == "dvwa" and protocol == "HTTP":

        if dst_ip is None and dst_port is None:

            dst_ip = ASSETS["dvwa"]["ip"]
            dst_port = ASSETS["dvwa"]["port"]

            destination_source = "자산설정"


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

        "스키마버전": "2.0",
        "이벤트ID": str(uuid4()),

        "발생시간": event_time,
        "발생시간출처": time_source,
        "로그기록시간": None,
        "전달레코드시간": None,

        "정규화시간": datetime.now(KST).isoformat(
            timespec="microseconds"
        ),

        "수집원": source_vm,
        "수집태그": None,

        "로그유형": log_type,
        "이벤트분류": EVENT_CATEGORIES[log_type],
        "이벤트유형": EVENTS[event_type],

        **severity_result,

        "출발지IP": clean_ip(src_ip),
        "출발지포트": clean_port(src_port),

        "목적지IP": clean_ip(dst_ip),
        "목적지포트": clean_port(dst_port),
        "목적지정보출처": destination_source,

        "프로토콜": protocol.upper() if protocol else None,

        "메시지": message,
        "상세정보": details,
        "원본로그": raw
    }
