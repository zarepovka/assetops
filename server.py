#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ai_engine import LOCAL_MODEL_NAME, LOCAL_PROVIDER_NAME, analyze_ticket


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "database" / "assetops.db"


def json_response(handler: SimpleHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: SimpleHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0") or "0")

    if content_length <= 0:
        return {}

    raw = handler.rfile.read(content_length)

    if not raw:
        return {}

    return json.loads(raw.decode("utf-8"))


def connect_database() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"SQLite database not found: {DB_PATH}")

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def fetch_database_counts() -> dict:
    tables = [
        "departments",
        "users",
        "executors",
        "equipment",
        "tickets",
        "ticket_history",
        "ai_analysis",
        "notifications",
    ]

    with connect_database() as connection:
        return {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in tables
        }


def fetch_system_data_from_db() -> dict:
    with connect_database() as connection:
        metadata = {
            row["key"]: row["value"]
            for row in connection.execute("SELECT key, value FROM app_metadata")
        }

        executors = [
            {"id": row["id"], "name": row["name"], "role": row["role"]}
            for row in connection.execute("SELECT id, name, role FROM executors ORDER BY id")
        ]

        equipment = [
            {
                "id": row["id"],
                "inventory": row["inventory"],
                "name": row["name"],
                "type": row["type"],
                "department": row["department"],
                "user": row["user_label"],
                "status": row["status"],
                "commissionedAt": row["commissioned_at"],
                "criticality": row["criticality"],
            }
            for row in connection.execute(
                """
                SELECT
                    e.id,
                    e.inventory,
                    e.name,
                    e.type,
                    d.name AS department,
                    e.user_label,
                    e.status,
                    e.commissioned_at,
                    e.criticality
                FROM equipment e
                JOIN departments d ON d.id = e.department_id
                ORDER BY e.inventory
                """
            )
        ]

        tickets = []
        ticket_rows = connection.execute(
            """
            SELECT
                id,
                opened_at,
                equipment_id,
                problem_type,
                category,
                base_priority,
                status,
                executor_id,
                description,
                result
            FROM tickets
            ORDER BY opened_at DESC, id DESC
            """
        )

        for row in ticket_rows:
            history = [
                {
                    "time": history_row["event_time"],
                    "status": history_row["status"],
                    "actor": history_row["actor"],
                    "comment": history_row["comment"],
                }
                for history_row in connection.execute(
                    """
                    SELECT event_time, status, actor, comment
                    FROM ticket_history
                    WHERE ticket_id = ?
                    ORDER BY sequence_no
                    """,
                    (row["id"],),
                )
            ]

            tickets.append(
                {
                    "id": row["id"],
                    "openedAt": row["opened_at"],
                    "equipmentId": row["equipment_id"],
                    "problemType": row["problem_type"],
                    "category": row["category"],
                    "basePriority": row["base_priority"],
                    "status": row["status"],
                    "executorId": row["executor_id"],
                    "description": row["description"],
                    "result": row["result"],
                    "history": history,
                }
            )

    return {
        "referenceDate": metadata.get("reference_date", "2026-04-08T10:00:00"),
        "enterprise": {"name": metadata.get("enterprise_name", "Primary Workspace")},
        "executors": executors,
        "equipment": equipment,
        "tickets": tickets,
        "database": {
            "source": "sqlite",
            "path": str(DB_PATH.relative_to(ROOT)),
        },
    }


class AssetOpsHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:
        request_path = self.path.split("?", 1)[0]

        if request_path == "/api/ai/status":
            json_response(
                self,
                {
                    "provider": LOCAL_PROVIDER_NAME,
                    "configured": True,
                    "available": True,
                    "model": LOCAL_MODEL_NAME,
                    "mode": "local",
                },
            )
            return

        if request_path == "/api/db/status":
            try:
                counts = fetch_database_counts()
            except FileNotFoundError as exc:
                json_response(
                    self,
                    {"available": False, "error": str(exc), "path": str(DB_PATH.relative_to(ROOT))},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return
            except sqlite3.Error as exc:
                json_response(
                    self,
                    {"available": False, "error": f"SQLite error: {exc}", "path": str(DB_PATH.relative_to(ROOT))},
                    HTTPStatus.BAD_GATEWAY,
                )
                return

            json_response(
                self,
                {
                    "available": True,
                    "engine": "SQLite",
                    "path": str(DB_PATH.relative_to(ROOT)),
                    "counts": counts,
                },
            )
            return

        if request_path == "/api/data":
            try:
                payload = fetch_system_data_from_db()
            except FileNotFoundError as exc:
                json_response(
                    self,
                    {"error": str(exc), "fallback": "assets/data.js"},
                    HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return
            except sqlite3.Error as exc:
                json_response(
                    self,
                    {"error": f"SQLite error: {exc}", "fallback": "assets/data.js"},
                    HTTPStatus.BAD_GATEWAY,
                )
                return

            json_response(self, payload)
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] != "/api/ai/analyze-ticket":
            json_response(self, {"error": "Маршрут не найден."}, HTTPStatus.NOT_FOUND)
            return

        try:
            payload = read_json_body(self)
        except json.JSONDecodeError:
            json_response(
                self,
                {"error": "Тело запроса должно быть корректным JSON."},
                HTTPStatus.BAD_REQUEST,
            )
            return

        try:
            analysis = analyze_ticket(payload)
        except ValueError as exc:
            json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:  # pragma: no cover
            json_response(self, {"error": f"Локальный AI-модуль завершился с ошибкой: {exc}"}, HTTPStatus.BAD_GATEWAY)
            return

        json_response(self, analysis)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Local AssetOps server with built-in AI endpoint.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), AssetOpsHandler)
    print(f"AssetOps server started on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
