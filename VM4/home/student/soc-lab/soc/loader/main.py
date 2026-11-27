
import argparse
import json
import time

from pathlib import Path

from loader.mapper import map_event

from loader.database import (
    connect_db,
    insert_event
)


# File paths
BASE_DIR = Path(__file__).resolve().parent.parent

INPUT_FILE = (
    BASE_DIR / "normalizer/output/normalized.jsonl"
)

ERROR_FILE = (
    BASE_DIR / "loader/failed.jsonl"
)


# Save invalid input
def save_failed(line, error):

    with ERROR_FILE.open(
        "a",
        encoding="utf-8"
    ) as file:

        file.write(
            json.dumps(
                {
                    "reason": str(error),
                    "input_record": line.strip()
                },
                ensure_ascii=False
            ) + "\n"
        )


# Main loader
def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--follow",
        action="store_true",
        help="Continuously load new events"
    )

    args = parser.parse_args()

    if not INPUT_FILE.exists():
        raise FileNotFoundError(INPUT_FILE)

    inserted = 0
    duplicates = 0
    failed = 0

    connection = connect_db()

    print("[START] SOC Database Loader")
    print(f"[INPUT] {INPUT_FILE}")
    print("[DATABASE] socdb.events")

    try:

        with INPUT_FILE.open(
            "r",
            encoding="utf-8"
        ) as file:

            while True:

                position = file.tell()
                line = file.readline()

                # Wait for complete new records
                if (
                    not line
                    or not line.endswith("\n")
                ):

                    file.seek(position)

                    if not args.follow:
                        break

                    time.sleep(0.5)
                    continue

                if not line.strip():
                    continue

                # Validate and map JSON
                try:

                    event = json.loads(line)

                    record = map_event(event)

                except (
                    ValueError,
                    TypeError,
                    KeyError,
                    AttributeError
                ) as error:

                    failed += 1

                    save_failed(line, error)

                    print(
                        f"[INVALID] {error}",
                        flush=True
                    )

                    continue

                # Insert into MariaDB
                saved = insert_event(
                    connection,
                    record
                )

                if saved:

                    inserted += 1

                    print(
                        f"[INSERTED] "
                        f"{record['log_type']} | "
                        f"{record['severity']} | "
                        f"{record['event_id']}",
                        flush=True
                    )

                else:

                    duplicates += 1

    except KeyboardInterrupt:

        print("\n[STOP] Database Loader")

    finally:

        connection.close()

        print("\n===== LOAD SUMMARY =====")
        print("Inserted  :", inserted)
        print("Duplicates:", duplicates)
        print("Failed    :", failed)

    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
