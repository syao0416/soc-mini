
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
            raise ValueError("잘못된 Fluent Bit 레코드")

        record["tag"] = match.group(1)

        record["forward_time"] = metadata_time(
            envelope[0]
        )

        data = envelope[1]


    # 중첩 JSON 해제 및 시간 정보 보존
    while True:

        if isinstance(data, dict):

            if "log" not in data:
                raise ValueError("log 필드 누락")

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

        raise ValueError("지원하지 않는 로그 데이터 형식")


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
        return "Fluent Bit 자체 운영 로그"

    if (
        " sudo:" in raw_log
        and "COMMAND=" in raw_log
        and "IPTABLES:" in raw_log
    ):
        return "iptables 관련 sudo 명령 기록"

    if not raw_log.strip():
        return "빈 로그"

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

    result["로그기록시간"] = record["docker_time"]

    result["전달레코드시간"] = record["forward_time"]

    result["수집태그"] = record["tag"]


    # 원본에 발생시간이 없는 경우 Docker 시간 사용
    if result["발생시간"] is None:

        if record["docker_time"]:

            result["발생시간"] = record["docker_time"]

            result["발생시간출처"] = "Docker 기록시간"

        elif record["forward_time"]:

            result["발생시간"] = record["forward_time"]

            result["발생시간출처"] = "Fluent Bit 이벤트시간"

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
def handle_log(line):

    raw_log = line.strip()

    if not raw_log:
        return

    try:

        record = extract_record(line)

        raw_log = record["raw"]

        reason = exclusion_reason(raw_log)

        # 수집 대상 외 로그 별도 보존
        if reason:

            save_json(EXCLUDED_FILE, {
                "원본로그": raw_log,
                "제외사유": reason,
                "입력레코드": line.strip()
            })

            print(f"[제외] {reason}", flush=True)
            return


        result = normalize_record(record)

        # 실제 미분류 로그
        if result is None:

            save_json(FAILED_FILE, {
                "원본로그": raw_log,
                "실패사유": "지원하지 않는 로그 형식",
                "입력레코드": line.strip()
            })

            print("[미분류] 로그 형식 미확인", flush=True)
            return


        save_json(OUTPUT_FILE, result)

        print(
            f"[정규화 완료] "
            f"{result['수집원']} | "
            f"{result['로그유형']} | "
            f"{result['이벤트유형']} | "
            f"{result['심각도']}",
            flush=True
        )


    except Exception as error:

        save_json(FAILED_FILE, {
            "원본로그": raw_log,
            "실패사유": str(error),
            "입력레코드": line.strip()
        })

        print(f"[오류] {error}", flush=True)


# 실시간 정규화 엔진
def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--from-start",
        action="store_true",
        help="원본 로그의 처음부터 처리"
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="현재 로그 처리 후 종료"
    )

    args = parser.parse_args()

    print("[시작] SOC 로그 정규화 엔진", flush=True)
    print(f"[입력] {INPUT_FILE}", flush=True)
    print(f"[출력] {OUTPUT_FILE}", flush=True)

    while not INPUT_FILE.exists():

        if args.once:
            raise FileNotFoundError(INPUT_FILE)

        time.sleep(1)


    with INPUT_FILE.open("r", encoding="utf-8") as file:

        if not args.from_start and not args.once:
            file.seek(0, 2)

        while True:

            position = file.tell()
            line = file.readline()

            if not line or not line.endswith("\n"):

                file.seek(position)

                if args.once:
                    break

                time.sleep(0.5)
                continue

            handle_log(line)


if __name__ == "__main__":

    try:
        main()

    except KeyboardInterrupt:
        print("\n[종료] SOC 로그 정규화 엔진")
