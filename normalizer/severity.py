
# 심각도 분류 정책

POLICY_VERSION = "SOC-SEVERITY-v1.0"

LEVELS = {
    0: "판단필요",
    1: "낮음",
    2: "중간",
    3: "높음",
    4: "심각"
}


def make_result(level, reason):
    return {
        "심각도": LEVELS[level],
        "심각도등급": level,
        "심각도판정근거": reason,
        "심각도정책": POLICY_VERSION
    }


def classify_severity(log_type, event_type, message, details):

    # Snort
    if log_type == "snort":

        priority = details.get("priority")

        if (
            priority == 0
            and details.get("signature_id") == "1:1000001:1"
            and message == "TEST ICMP Echo Request"
        ):
            return make_result(0, "프로젝트 ICMP 테스트 규칙")

        priority_map = {
            1: (3, "Snort 우선순위 1 탐지"),
            2: (2, "Snort 우선순위 2 탐지"),
            3: (1, "Snort 우선순위 3 탐지"),
            4: (1, "Snort 우선순위 4 탐지")
        }

        level, reason = priority_map.get(
            priority,
            (2, "정의되지 않은 IDS 우선순위 확인 필요")
        )

        return make_result(level, reason)

    # iptables
    if log_type == "iptables":

        return make_result(
            0,
            "방화벽 패킷 기록이며 차단 여부 미확인"
        )

    # DVWA / Apache
    if log_type == "dvwa":

        status = details.get("http_status")
        apache_level = details.get("apache_level")

        if event_type == "apache_system_event":

            level_map = {
                "notice": 0,
                "info": 0,
                "debug": 0,
                "warn": 1,
                "warning": 1,
                "error": 2,
                "crit": 2,
                "alert": 2,
                "emerg": 2
            }

            level = level_map.get(apache_level, 1)

            return make_result(
                level,
                f"Apache 운영 로그: {apache_level or '미확인'}"
            )

        if status is not None:

            if status >= 500:
                return make_result(2, "HTTP 서버 오류")

            if status in (401, 403):
                return make_result(1, "HTTP 인증 또는 접근 제한 응답")

            if status == 408:
                return make_result(0, "HTTP 요청 시간 초과")

            if status >= 400:
                return make_result(0, "HTTP 클라이언트 오류")

        return make_result(0, "일반 HTTP 요청 기록")

    # MariaDB
    if log_type == "mariadb":

        if event_type == "authentication_failure":
            return make_result(2, "데이터베이스 인증 실패")

        db_level = str(
            details.get("database_level") or ""
        ).lower()

        if db_level == "error":
            return make_result(2, "데이터베이스 오류 발생")

        if db_level in ("warn", "warning"):
            return make_result(1, "데이터베이스 운영 경고")

        return make_result(0, "일반 데이터베이스 운영 기록")

    return make_result(0, "별도 심각도 판정 정책 없음")

