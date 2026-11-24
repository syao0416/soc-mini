
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
    **extra_fields
):
    normalized = {
        "timestamp": timestamp,
        "source_vm": source_vm,
        "log_type": log_type,
        "event_type": event_type,
        "severity": severity,
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "protocol": protocol,
        "message": message,
        "raw": raw
    }

    normalized.update(extra_fields)

    return normalized
