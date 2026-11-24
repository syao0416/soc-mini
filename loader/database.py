# MariaDB 접속과 Insert 처리
import os
import pymysql

from getpass import getpass

from loader.mapper import DB_COLUMNS


# MariaDB connection
def connect_db():

    password = os.getenv("SOC_DB_PASSWORD")

    if password is None:
        password = getpass("MariaDB password: ")

    return pymysql.connect(

        host=os.getenv(
            "SOC_DB_HOST", "127.0.0.1"
        ),

        port=int(os.getenv(
            "SOC_DB_PORT", "13306"
        )),

        user=os.getenv(
            "SOC_DB_USER", "student"
        ),

        password=password,

        database=os.getenv(
            "SOC_DB_NAME", "socdb"
        ),

        charset="utf8mb4",

        autocommit=True,

        connect_timeout=5,

        init_command="SET time_zone = '+00:00'"
    )


# INSERT statement
COLUMNS = ", ".join(DB_COLUMNS)

PLACEHOLDERS = ", ".join(
    ["%s"] * len(DB_COLUMNS)
)

INSERT_SQL = f"""
INSERT INTO events (
    {COLUMNS}
)
VALUES (
    {PLACEHOLDERS}
)
"""


# Save event
def insert_event(connection, record):

    values = tuple(
        record[column]
        for column in DB_COLUMNS
    )

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                INSERT_SQL,
                values
            )

        return True

    except pymysql.err.IntegrityError as error:

        # Duplicate primary key
        if error.args[0] == 1062:
            return False

        raise


# Connection test
if __name__ == "__main__":

    connection = connect_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                "SELECT DATABASE(), VERSION()"
            )

            database, version = cursor.fetchone()

            print("[SUCCESS] Connected to MariaDB")
            print("Database:", database)
            print("Version:", version)

            cursor.execute(
                "SELECT COUNT(*) FROM events"
            )

            print("Events:", cursor.fetchone()[0])

    finally:
        connection.close()
