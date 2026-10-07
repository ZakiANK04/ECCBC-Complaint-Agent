"""
Minimal ticket store backed by a single JSON file.
On Vercel the bundle filesystem is read-only, so all writes go to /tmp.
"""
import json
import os
import pathlib
import shutil
import uuid
from datetime import datetime

_VERCEL = bool(os.getenv("VERCEL"))
_BUNDLE_DIR = pathlib.Path(__file__).resolve().parent.parent

if _VERCEL:
    _DATA_DIR = pathlib.Path("/tmp/eccbc/data")
else:
    _DATA_DIR = _BUNDLE_DIR / "data"

TICKETS_PATH = _DATA_DIR / "tickets.json"


def _ensure_tickets_file() -> None:
    """On Vercel cold start: seed /tmp from the committed tickets.json if available."""
    if TICKETS_PATH.exists():
        return
    TICKETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    bundle_tickets = _BUNDLE_DIR / "data" / "tickets.json"
    if _VERCEL and bundle_tickets.exists():
        try:
            shutil.copy2(bundle_tickets, TICKETS_PATH)
            return
        except Exception:
            pass
    # Create empty file
    with open(TICKETS_PATH, "w", encoding="utf-8") as f:
        json.dump([], f)


def _load_all() -> list[dict]:
    _ensure_tickets_file()
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


def get_ticket(ticket_id: str) -> dict | None:
    for t in _load_all():
        if t["ticket_id"] == ticket_id:
            return t
    return None


def update_status(ticket_id: str, status: str, updated_by: str | None = None) -> bool:
    """Returns False when the ticket does not exist."""
    tickets = _load_all()
    found = False
    for t in tickets:
        if t["ticket_id"] == ticket_id:
            t["status"] = status
            t["status_updated_at"] = datetime.now().isoformat(timespec="seconds")
            if updated_by:
                t["status_updated_by"] = updated_by
            found = True
    if found:
        _save_all(tickets)
    return found
