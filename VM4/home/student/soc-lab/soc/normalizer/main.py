
import argparse
import json
import re
import time

from datetime import datetime, timezone
from pathlib import Path

from normalizer.normalizer import KST

from normalizer.parsers.snort import parse_snort
from normalizer.parsers.iptables import parse_iptables
from normalizer.parsers.dvwa import parse_dvwa
from normalizer.parsers.mariadb import parse_mariadb
from normalizer.parsers.auditd import AuditAssembler, build_event

AUDIT = AuditAssembler()
AUDIT_SEEN = set()
AUDIT_TAGS = {"vm2.auditd", "vm3.auditd"}


# 파일 경로 설정
BASE_DIR = Path(__file__).resolve().parent.parent

INPUT_FILE = BASE_DIR / "logs/incoming.log"

OUTPUT_DIR = BASE_DIR / "normalizer/output"

OUTPUT_FILE = OUTPUT_DIR / "normalized.jsonl"
FAILED_FILE = OUTPUT_DIR / "unparsed.jsonl"
EXCLUDED_FILE = OUTPUT_DIR / "excluded.jsonl"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# 메타데이터 시간 변환
def metadata_time(value):

    if value is None:
        return None

    try:

        if isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(
                value,
                tz=timezone.utc
            )

        else:
            dt = datetime.fromisoformat(value)

            if dt.tzinfo is None:
                return None

        return dt.astimezone(KST).isoformat(
            timespec="microseconds"
        )

    except (ValueError, TypeError, OverflowError, OSError):
        return None


# Fluent Bit 및 Docker 중첩 JSON 해제
def extract_record(line):

    data = line.strip()

    record = {
        "raw": None,
        "docker_time": None,
        "forward_time": None,
        "tag": None
    }

    # Fluent Bit out_file 형식 지원
    match = re.match(
        r"^([^\s:]+):\s*(\[.*\])$",
        data
    )

    if match:

        envelope = json.loads(match.group(2))

        if len(envelope) != 2:
            raise ValueError("Invalid Fluent Bit record")

        record["tag"] = match.group(1)

        record["forward_time"] = metadata_time(
            envelope[0]
        )

        data = envelope[1]


    # 중첩 JSON 해제 및 시간 정보 보존
    while True:

        if isinstance(data, dict):

            if "log" not in data:
                raise ValueError("Missing log field")

            timestamp = metadata_time(data.get("time"))

            if timestamp:
                record["docker_time"] = timestamp

            data = data["log"]
            continue

        if isinstance(data, str):

            data = data.strip()

            try:
                data = json.loads(data)

            except json.JSONDecodeError:

                record["raw"] = data

                return record

            continue

        raise ValueError("Unsupported log data format")


# 기존 함수와의 호환성 유지
def extract_raw_log(line):
    return extract_record(line)["raw"]


# 수집 대상 외 로그 분류
def exclusion_reason(raw_log):

    if re.match(
        r"^\[\d{4}/\d{2}/\d{2} "
        r"\d{2}:\d{2}:\d{2}\]\s+"
        r"\[\s*(info|warn|error|debug|trace)\s*\]",
        raw_log
    ):
        return "Fluent Bit internal log"

    if (
        " sudo:" in raw_log
        and "COMMAND=" in raw_log
        and "IPTABLES:" in raw_log
    ):
        return "iptables-related sudo command log"

    if not raw_log.strip():
        return "Empty log"

    return None


# 로그 분류 및 파서 실행
def process_log(raw_log, reference_time=None):

    raw_log = raw_log.strip()

    if not raw_log:
        return None

    result = parse_iptables(raw_log)

    if result is not None:
        return result

    result = parse_snort(
        raw_log,
        reference_time=reference_time
    )

    if result is not None:
        return result

    result = parse_dvwa(raw_log)

    if result is not None:
        return result

    return parse_mariadb(raw_log)


# 메타데이터 보완
def enrich_record(result, record):

    result["log_timestamp"] = record["docker_time"]

    result["forward_timestamp"] = record["forward_time"]

    result["tag"] = record["tag"]


    # 원본에 발생시간이 없는 경우 Docker 시간 사용
    if result["timestamp"] is None:

        if record["docker_time"]:

            result["timestamp"] = record["docker_time"]

            result["timestamp_source"] = "docker_log_time"

        elif record["forward_time"]:

            result["timestamp"] = record["forward_time"]

            result["timestamp_source"] = "fluent_bit_event_time"

    return result


# 단일 입력 레코드 정규화
def normalize_record(record):

    reference = (
        record["docker_time"]
        or record["forward_time"]
    )

    reference_time = (
        datetime.fromisoformat(reference)
        if reference
        else None
    )

    result = process_log(
        record["raw"],
        reference_time=reference_time
    )

    if result is None:
        return None

    return enrich_record(result, record)


# JSONL 저장
def save_json(path, data):

    with path.open("a", encoding="utf-8") as file:

        file.write(
            json.dumps(
                data,
                ensure_ascii=False,
                separators=(",", ":")
            ) + "\n"
        )


# 개별 로그 처리
def flush_audit(force=False):

    for group in AUDIT.ready(force=force):

        try:
            event = build_event(group)

            if event is None:
                continue

            event_id = event["event_id"]

            if event_id in AUDIT_SEEN:
                continue

            save_json(OUTPUT_FILE, event)
            AUDIT_SEEN.add(event_id)

            print(
                f"[NORMALIZED] {event['source_vm']} | "
                f"auditd | {event['event_type']} | "
                f"{event['severity']}",
                flush=True
            )

        except Exception as error:

            save_json(FAILED_FILE, {
                "reason": str(error),
                "raw": "\n".join(
                    item["raw"] for item in group["records"]
                )
            })

            print(f"[AUDIT ERROR] {error}", flush=True)


def handle_log(line):

    raw_log = line.strip()

    if not raw_log:
        return

    try:

        record = extract_record(line)

        raw_log = record["raw"]

        if record["tag"] in AUDIT_TAGS:
            AUDIT.feed(record)
            return

        reason = exclusion_reason(raw_log)

        # 수집 대상 외 로그 별도 보존
        if reason:

            save_json(EXCLUDED_FILE, {
                "raw": raw_log,
                "reason": reason,
                "input_record": line.strip()
            })

            print(f"[EXCLUDED] {reason}", flush=True)
            return


        result = normalize_record(record)

        # 실제 미분류 로그
        if result is None:

            save_json(FAILED_FILE, {
                "raw": raw_log,
                "reason": "Unsupported log format",
                "input_record": line.strip()
            })

            print("[UNPARSED] Unknown log format", flush=True)
            return


        save_json(OUTPUT_FILE, result)

        print(
            f"[NORMALIZED] "
            f"{result['source_vm']} | "
            f"{result['log_type']} | "
            f"{result['event_type']} | "
            f"{result['severity']}",
            flush=True
        )


    except Exception as error:

        save_json(FAILED_FILE, {
            "raw": raw_log,
            "reason": str(error),
            "input_record": line.strip()
        })

        print(f"[ERROR] {error}", flush=True)


# 실시간 정규화 엔진
def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--from-start",
        action="store_true",
        help="Process logs from the beginning"
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="Process current logs and exit"
    )

    parser.add_argument(
        "--recover-audit",
        action="store_true",
        help="Recover historical audit logs before following new logs"
    )

    args = parser.parse_args()

    if args.recover_audit and (args.once or args.from_start):
        parser.error("--recover-audit must be used alone")

    if OUTPUT_FILE.exists():

        with OUTPUT_FILE.open("r", encoding="utf-8") as existing:

            for line in existing:

                try:
                    event = json.loads(line)

                    if event.get("log_type") == "auditd":
                        AUDIT_SEEN.add(event["event_id"])

                except (ValueError, KeyError, AttributeError):
                    continue

    print("[START] SOC Log Normalizer", flush=True)
    print(f"[INPUT] {INPUT_FILE}", flush=True)
    print(f"[OUTPUT] {OUTPUT_FILE}", flush=True)

    while not INPUT_FILE.exists():

        if args.once:
            raise FileNotFoundError(INPUT_FILE)

        time.sleep(1)


    with INPUT_FILE.open("r", encoding="utf-8") as file:

        replay_end = None

        if args.recover_audit:
            replay_end = file.seek(0, 2)
            file.seek(0)

        elif not args.from_start and not args.once:
            file.seek(0, 2)

        while True:

            flush_audit()

            position = file.tell()
            line = file.readline()

            if not line or not line.endswith("\n"):

                file.seek(position)

                if args.once:
                    flush_audit(force=True)
                    break

                time.sleep(0.5)
                continue

            if replay_end is not None and position < replay_end:

                if not line.lstrip().startswith(
                    ("vm2.auditd:", "vm3.auditd:")
                ):
                    continue

            handle_log(line)


if __name__ == "__main__":

    try:
        main()

    except KeyboardInterrupt:
        flush_audit(force=True)
        print("\n[STOP] SOC Log Normalizer")
