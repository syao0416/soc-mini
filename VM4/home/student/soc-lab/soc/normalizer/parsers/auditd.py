import re
import time
import shlex
import ipaddress

from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL

from normalizer.normalizer import normalize_log


AUDIT_PATTERN = re.compile(
    r"^type=(\w+)\s+msg=audit\(([\d.]+):(\d+)\):"
)

FIELD_PATTERN = re.compile(
    r'(?<!\S)([A-Za-z][A-Za-z0-9_]*(?:\[\d+\])?)='
    r'(?:"([^"]*)"|(\S+))'
)

RECORD_TYPES = {
    "SYSCALL",
    "EXECVE",
    "CWD",
    "PATH",
    "PROCTITLE",
    "NETFILTER_CFG"
}

SOURCE_MAP = {
    "vm2.auditd": "VM2",
    "vm3.auditd": "VM3"
}


def parse_fields(raw):
    return {
        key: (
            quoted if quoted is not None else unquoted,
            quoted is not None
        )
        for key, quoted, unquoted
        in (m.groups() for m in FIELD_PATTERN.finditer(raw))
    }


def field(fields, key):
    value = fields.get(key)
    return value[0] if value else None


def integer(value):
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def decode_argument(value):
    text, quoted = value

    if (
        not quoted
        and len(text) % 2 == 0
        and re.fullmatch(r"[0-9a-fA-F]+", text)
    ):
        return bytes.fromhex(text).decode(
            "utf-8", errors="replace"
        )

    return text


def decode_proctitle(value):
    if not value:
        return []

    try:
        return [
            part.decode("utf-8", errors="replace")
            for part in bytes.fromhex(value).rstrip(b"\x00").split(b"\x00")
        ]
    except ValueError:
        return []


class AuditAssembler:

    def __init__(self):
        self.pending = {}

    def feed(self, record):

        tag = record.get("tag")

        if tag not in SOURCE_MAP:
            return

        raw = record["raw"]
        match = AUDIT_PATTERN.match(raw)

        if not match:
            return

        record_type, epoch, serial = match.groups()

        if record_type not in RECORD_TYPES:
            return

        audit_id = f"{epoch}:{serial}"
        key = (tag, audit_id)

        group = self.pending.setdefault(key, {
            "tag": tag,
            "audit_id": audit_id,
            "epoch": epoch,
            "records": [],
            "last_seen": time.monotonic()
        })

        if not any(
            item["raw"] == raw
            for item in group["records"]
        ):
            group["records"].append({
                "type": record_type,
                "raw": raw,
                "fields": parse_fields(raw),
                "forward_time": record.get("forward_time")
            })

        group["last_seen"] = time.monotonic()

    def ready(self, force=False):

        now = time.monotonic()

        for key, group in list(self.pending.items()):

            expired = now - group["last_seen"] >= 3

            if force or expired or len(self.pending) > 2048:

                del self.pending[key]
                yield group


def firewall_response(group, fields, arguments):

    if (
        group["tag"] != "vm2.auditd"
        or field(fields, "comm") != "iptables"
        or field(fields, "success") != "yes"
    ):
        return {}

    for flag, action, operation in (
        ("-I", "ban", "nft_register_rule"),
        ("-D", "unban", "nft_unregister_rule")
    ):
        if flag not in arguments:
            continue

        try:
            chain = arguments[arguments.index(flag) + 1]

            target = str(ipaddress.ip_address(
                arguments[arguments.index("-s") + 1]
            ))

            verdict = arguments[arguments.index("-j") + 1]

        except (ValueError, IndexError):
            continue

        if chain != "f2b-dvwa-login":
            continue

        if verdict not in ("REJECT", "DROP"):
            continue

        if not any(
            item["type"] == "NETFILTER_CFG"
            and field(item["fields"], "op") == operation
            for item in group["records"]
        ):
            continue

        return {
            "response_tool": "fail2ban",
            "action": action,
            "jail": "dvwa-login",
            "chain": chain,
            "target_ip": target,
            "netfilter_operation": operation
        }

    return {}


def build_event(group):

    records = group["records"]

    syscall = next(
        (
            item for item in records
            if item["type"] == "SYSCALL"
        ),
        None
    )

    if syscall is None:
        return None

    fields = syscall["fields"]

    argv_fields = {}

    for item in records:
        if item["type"] == "EXECVE":
            argv_fields.update(item["fields"])

    argc = integer(field(argv_fields, "argc"))

    arguments = []

    arguments_complete = (
        argc is not None
        and 0 <= argc <= 4096
        and all(
            f"a{i}" in argv_fields
            for i in range(argc)
        )
    )

    if arguments_complete:

        arguments = [
            decode_argument(argv_fields[f"a{i}"])
            for i in range(argc)
        ]

    else:

        proctitle = next(
            (
                field(item["fields"], "proctitle")
                for item in records
                if item["type"] == "PROCTITLE"
            ),
            None
        )

        arguments = decode_proctitle(proctitle)

    response = firewall_response(group, fields, arguments)

    if not response and field(fields, "key") != "soc_command":
        return None

    event_type = "ip_" + response["action"] if response else "command_execution"

    command = (
        shlex.join(arguments)
        if arguments
        else field(fields, "comm")
    )

    cwd = next(
        (
            field(item["fields"], "cwd")
            for item in records
            if item["type"] == "CWD"
        ),
        None
    )

    success_value = field(fields, "success")

    success = {
        "yes": True,
        "no": False
    }.get(success_value)

    timestamp = datetime.fromtimestamp(
        float(group["epoch"]),
        tz=timezone.utc
    ).isoformat()

    event = normalize_log(
        source_vm=SOURCE_MAP[group["tag"]],
        log_type="auditd",
        event_type=event_type,
        src_ip=response.get("target_ip"),
        timestamp=timestamp,
        message=(
            f"Fail2ban rule {response['action']}: {response['target_ip']}"
            if response else f"Command executed: {command}"
        ),
        raw="\n".join(
            item["raw"] for item in records
        ),
        audit_event_id=group["audit_id"],
        audit_key=field(fields, "key"),
        command=command,
        arguments=arguments,
        argument_count=argc,
        arguments_complete=arguments_complete,
        executable=field(fields, "exe"),
        cwd=cwd,
        auid=integer(field(fields, "auid")),
        uid=integer(field(fields, "uid")),
        euid=integer(field(fields, "euid")),
        pid=integer(field(fields, "pid")),
        ppid=integer(field(fields, "ppid")),
        session_id=integer(field(fields, "ses")),
        tty=field(fields, "tty"),
        success=success,
        syscall_exit=integer(field(fields, "exit")),
        **response
    )

    event["tag"] = group["tag"]

    event["forward_timestamp"] = syscall.get(
        "forward_time"
    )

    # 동일 감사 이벤트 재처리 시 동일 ID 유지
    event["event_id"] = str(uuid5(
        NAMESPACE_URL,
        f"soc-audit:{group['tag']}:{group['audit_id']}"
    ))

    return event
