
# 심각도 분류 정책

POLICY_VERSION = "SOC-SEVERITY-v1.0"

LEVELS = {
    0: "info",
    1: "low",
    2: "medium",
    3: "high",
    4: "critical"
}


def make_result(level, reason):
    return {
        "severity": LEVELS[level],
        "severity_level": level,
        "severity_reason": reason,
        "severity_policy": POLICY_VERSION
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
            return make_result(0, "Project ICMP test rule")

        priority_map = {
            1: (3, "Snort priority 1 alert"),
            2: (2, "Snort priority 2 alert"),
            3: (1, "Snort priority 3 alert"),
            4: (1, "Snort priority 4 alert")
        }

        level, reason = priority_map.get(
            priority,
            (2, "Undefined IDS priority; review required")
        )

        return make_result(level, reason)

    # iptables
    if log_type == "iptables":

        return make_result(
            0,
            "Firewall packet logged; blocking status unknown"
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
                f"Apache operational log: {apache_level or 'unknown'}"
            )

        if status is not None:

            if status >= 500:
                return make_result(2, "HTTP server error")

            if status in (401, 403):
                return make_result(1, "HTTP authentication or access restriction response")

            if status == 408:
                return make_result(0, "HTTP request timeout")

            if status >= 400:
                return make_result(0, "HTTP client error")

        return make_result(0, "Normal HTTP request log")

    # MariaDB
    if log_type == "mariadb":

        if event_type == "authentication_failure":
            return make_result(2, "Database authentication failure")

        db_level = str(
            details.get("database_level") or ""
        ).lower()

        if db_level == "error":
            return make_result(2, "Database error")

        if db_level in ("warn", "warning"):
            return make_result(1, "Database operational warning")

        return make_result(0, "Normal database operational log")

    return make_result(0, "No specific severity policy")

