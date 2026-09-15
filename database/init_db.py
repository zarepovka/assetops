#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = ROOT / "assetops.db"
SCHEMA_PATH = ROOT / "schema.sql"
SEED_PATH = ROOT / "seed.sql"


def run_sql_script(connection: sqlite3.Connection, path: Path) -> None:
    connection.executescript(path.read_text(encoding="utf-8"))


def init_database(db_path: Path = DEFAULT_DB_PATH) -> Path:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        run_sql_script(connection, SCHEMA_PATH)
        run_sql_script(connection, SEED_PATH)
        connection.commit()

    return db_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the local AssetOps SQLite database.")
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB_PATH,
        help="Path to the SQLite database file.",
    )
    args = parser.parse_args()

    db_path = init_database(args.db)
    print(f"SQLite database initialized: {db_path}")


if __name__ == "__main__":
    main()
