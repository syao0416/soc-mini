
import json
import re
import time
from pathlib import Path

from normalizer.parsers.snort import parse_snort
from normalizer.parsers.iptables import parse_iptables
from normalizer.parsers.dvwa import parse_dvwa
from normalizer.parsers.mariadb import parse_mariadb


# 파일 경로 설정
BASE_DIR = Path(__file__).resolve().parent.parent

INPUT_FILE = BASE_DIR / "logs/incoming.log"
OUTPUT_FILE = BASE_DIR / "normalizer/output/normalized.jsonl"
FAILED_FILE = BASE_DIR / "normalizer/output/unparsed.jsonl"

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)


# 중첩 JSON 해제
def extract_raw_log(line):
    data = line.strip()

    while isinstance(data, str):
        try:
            decoded = json.loads(data)
        except json.JSONDecodeError:
            return data.strip()

        if isinstance(decoded, dict):
            if "log" not in decoded:
                raise ValueError("Missing log field")

            data = decoded["log"]

        elif isinstance(decoded, str):
            data = decoded
        else:
            raise ValueError("Invalid log format")

    raise ValueError("Invalid log data")


# 로그 유형 분류 및 파서 실행
def process_log(raw_log):

    # iptables
    if "IPTABLES:" in raw_log and "SRC=" in raw_log:
        return parse_iptables(raw_log)

    # Snort
    if "[**]" in raw_log:
        return parse_snort(raw_log)

    # DVWA / Apache
    if re.search(r'"[A-Z]+ .* HTTP/[\d.]+"', raw_log):
        return parse_dvwa(raw_log)

    # MariaDB
    if re.match(
        r"^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}:\d{2}",
        raw_log
    ):
        return parse_mariadb(raw_log)

    return None


# JSONL 파일 저장
def save_json(path, data):
    with path.open("a", encoding="utf-8") as file:
        file.write(
            json.dumps(data, ensure_ascii=False) + "\n"
        )


# 실시간 로그 처리
def main():

    print("[START] SOC Log Normalizer", flush=True)
    print(f"[INPUT] {INPUT_FILE}", flush=True)
    print(f"[OUTPUT] {OUTPUT_FILE}", flush=True)

    while not INPUT_FILE.exists():
        time.sleep(1)

    with INPUT_FILE.open("r", encoding="utf-8") as file:

        # 실행 이후 새로 들어오는 로그부터 처리
        file.seek(0, 2)

        while True:
            position = file.tell()
            line = file.readline()

            if not line or not line.endswith("\n"):
                file.seek(position)
                time.sleep(0.5)
                continue

            try:
                raw_log = extract_raw_log(line)
                result = process_log(raw_log)

                if result:
                    save_json(OUTPUT_FILE, result)

                    print(
                        f"[SUCCESS] {result['log_type']} normalized",
                        flush=True
                    )

                else:
                    save_json(FAILED_FILE, {
                        "raw": raw_log,
                        "reason": "Unknown or unsupported log"
                    })

                    print("[FAILED] Unparsed log", flush=True)

            except Exception as error:

                save_json(FAILED_FILE, {
                    "raw": line.strip(),
                    "reason": str(error)
                })

                print(f"[ERROR] {error}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[STOP] SOC Log Normalizer")
