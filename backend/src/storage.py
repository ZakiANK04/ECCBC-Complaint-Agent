"""
Minimal ticket store backed by a single JSON file. This is intentionally
simple for a 15-day prototype — swap for SQLite/Postgres later if this
goes beyond a demo.
"""
import json
import pathlib
import uuid
from datetime import datetime

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
TICKETS_PATH = BASE_DIR / "data" / "tickets.json"


def _load_all() -> list[dict]:
    if not TICKETS_PATH.exists():
        return []
    with open(TICKETS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_all(tickets: list[dict]) -> None:
    TICKETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(TICKETS_PATH, "w", encoding="utf-8") as f:
        json.dump(tickets, f, ensure_ascii=False, indent=2)


def new_ticket_id() -> str:
    return datetime.now().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:6].upper()


def save_ticket(ticket: dict) -> None:
    tickets = _load_all()
    tickets.append(ticket)
    _save_all(tickets)


def list_tickets() -> list[dict]:
    return sorted(_load_all(), key=lambda t: t["created_at"], reverse=True)


def update_status(ticket_id: str, status: str) -> None:
    tickets = _load_all()
    for t in tickets:
        if t["ticket_id"] == ticket_id:
            t["status"] = status
    _save_all(tickets)
