"""
Role-based access control for the ECCBC Complaint Assistant.

- Accounts live in a single JSON file (data/users.json, /tmp on Vercel).
- Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib only, no extra deps).
- Sessions are stateless HMAC-signed tokens so they survive serverless
  cold starts without a session store.

Three roles:
- client   : chat assistant only (submit complaints, follow own tickets)
- employee : dashboard + root cause analysis
- admin    : everything, plus settings and account management
"""
import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import Depends, Header, HTTPException

_VERCEL = bool(os.getenv("VERCEL"))
_BUNDLE_DIR = pathlib.Path(__file__).resolve().parent.parent
_DATA_DIR = pathlib.Path("/tmp/eccbc/data") if _VERCEL else _BUNDLE_DIR / "data"

USERS_PATH = _DATA_DIR / "users.json"
_SECRET_PATH = _DATA_DIR / ".auth_secret"

ROLES = ("client", "employee", "admin")
TOKEN_TTL_SECONDS = 12 * 60 * 60
_PBKDF2_ITERATIONS = 120_000
MIN_PASSWORD_LENGTH = 8


# ---------------------------------------------------------------- hashing --
def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), _PBKDF2_ITERATIONS)
    return digest.hex(), salt


def _verify_password(password: str, user: dict) -> bool:
    digest, _ = _hash_password(password, user["salt"])
    return hmac.compare_digest(digest, user["password_hash"])


# ------------------------------------------------------------ demo seeds --
def _demo_seeds() -> list[dict]:
    """The three starter accounts. Passwords can be overridden through env
    so a deployed instance never has to ship the documented defaults."""
    return [
        {
            "username": "client",
            "password": os.getenv("DEMO_CLIENT_PASSWORD", "Client@2026"),
            "name": "Client Démo",
            "company": "Point de vente — Rouiba",
            "email": "",
            "role": "client",
        },
        {
            "username": "employee",
            "password": os.getenv("DEMO_EMPLOYEE_PASSWORD", "Employee@2026"),
            "name": "Employé Démo",
            "company": "ECCBC — Fruital Rouiba",
            "email": "",
            "role": "employee",
        },
        {
            "username": "admin",
            "password": os.getenv("DEMO_ADMIN_PASSWORD", "Admin@2026"),
            "name": "Administrateur",
            "company": "ECCBC — Fruital Rouiba",
            "email": "",
            "role": "admin",
        },
    ]


def _new_user_record(username: str, password: str, name: str, role: str, email: str = "", company: str = "",
                     user_id: Optional[str] = None) -> dict:
    password_hash, salt = _hash_password(password)
    return {
        "id": user_id or uuid.uuid4().hex[:12],
        "username": username,
        "name": name,
        "company": company,
        "email": email,
        "role": role,
        "active": True,
        "password_hash": password_hash,
        "salt": salt,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "last_login_at": None,
    }


# ---------------------------------------------------------------- storage --
def _save_users(users: list[dict]) -> None:
    USERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)


def _load_users() -> list[dict]:
    if not USERS_PATH.exists():
        # Starter accounts get fixed ids: on serverless every instance seeds its
        # own copy, and a session opened on one must be valid on the others.
        users = [
            _new_user_record(s["username"], s["password"], s["name"], s["role"], s["email"], s["company"],
                             user_id=f"seed-{s['username']}")
            for s in _demo_seeds()
        ]
        _save_users(users)
        return users
    with open(USERS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def public_user(user: dict) -> dict:
    """User record without credential material — the only shape sent to clients."""
    return {k: v for k, v in user.items() if k not in ("password_hash", "salt")}


def _find(users: list[dict], *, user_id: Optional[str] = None, username: Optional[str] = None) -> Optional[dict]:
    for u in users:
        if user_id is not None and u["id"] == user_id:
            return u
        if username is not None and u["username"].lower() == username.lower():
            return u
    return None


def _active_admin_count(users: list[dict]) -> int:
    return sum(1 for u in users if u["role"] == "admin" and u["active"])


def _validate_password(password: str) -> None:
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.")


def _normalize_username(username: str) -> str:
    username = (username or "").strip().lower()
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-@")
    if len(username) < 3 or any(c not in allowed for c in username):
        raise HTTPException(
            400, "Identifiant invalide : 3 caractères minimum, lettres, chiffres, point, tiret ou underscore."
        )
    return username


# ------------------------------------------------------------- user CRUD --
def list_users() -> list[dict]:
    return [public_user(u) for u in _load_users()]


def create_user(username: str, password: str, name: str, role: str, email: str = "", company: str = "") -> dict:
    username = _normalize_username(username)
    if role not in ROLES:
        raise HTTPException(400, f"Rôle inconnu : {role}.")
    if not (name or "").strip():
        raise HTTPException(400, "Le nom est obligatoire.")
    _validate_password(password)

    users = _load_users()
    if _find(users, username=username):
        raise HTTPException(409, f"L'identifiant « {username} » existe déjà.")
    user = _new_user_record(username, password, name.strip(), role, (email or "").strip(), (company or "").strip())
    users.append(user)
    _save_users(users)
    return public_user(user)


def update_user(user_id: str, changes: dict, acting_user: dict) -> dict:
    users = _load_users()
    user = _find(users, user_id=user_id)
    if not user:
        raise HTTPException(404, "Compte introuvable.")

    new_role = changes.get("role", user["role"])
    new_active = changes.get("active", user["active"])
    if new_role not in ROLES:
        raise HTTPException(400, f"Rôle inconnu : {new_role}.")

    is_self = user["id"] == acting_user["id"]
    if is_self and (new_role != "admin" or not new_active):
        raise HTTPException(400, "Vous ne pouvez pas retirer vos propres droits d'administrateur.")
    loses_admin = user["role"] == "admin" and user["active"] and (new_role != "admin" or not new_active)
    if loses_admin and _active_admin_count(users) <= 1:
        raise HTTPException(400, "Au moins un administrateur actif est requis.")

    for field in ("name", "email", "company"):
        if changes.get(field) is not None:
            user[field] = str(changes[field]).strip()
    if not user["name"]:
        raise HTTPException(400, "Le nom est obligatoire.")
    user["role"] = new_role
    user["active"] = bool(new_active)

    if changes.get("password"):
        _validate_password(changes["password"])
        user["password_hash"], user["salt"] = _hash_password(changes["password"])

    _save_users(users)
    return public_user(user)


def delete_user(user_id: str, acting_user: dict) -> None:
    users = _load_users()
    user = _find(users, user_id=user_id)
    if not user:
        raise HTTPException(404, "Compte introuvable.")
    if user["id"] == acting_user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")
    if user["role"] == "admin" and user["active"] and _active_admin_count(users) <= 1:
        raise HTTPException(400, "Au moins un administrateur actif est requis.")
    _save_users([u for u in users if u["id"] != user_id])


def change_own_password(acting_user: dict, current_password: str, new_password: str) -> None:
    users = _load_users()
    user = _find(users, user_id=acting_user["id"])
    if not user or not _verify_password(current_password, user):
        raise HTTPException(400, "Mot de passe actuel incorrect.")
    _validate_password(new_password)
    user["password_hash"], user["salt"] = _hash_password(new_password)
    _save_users(users)


def demo_accounts() -> list[dict]:
    """Starter credentials for the login screen. Only returned while the demo
    switch is on AND the account still uses its seeded password, so changing
    a password immediately stops it from being advertised."""
    if os.getenv("DEMO_ACCOUNTS", "true").lower() not in ("true", "1", "yes"):
        return []
    users = _load_users()
    out = []
    for seed in _demo_seeds():
        user = _find(users, username=seed["username"])
        if user and user["active"] and user["role"] == seed["role"] and _verify_password(seed["password"], user):
            out.append({"username": seed["username"], "password": seed["password"], "role": seed["role"]})
    return out


# ----------------------------------------------------------------- tokens --
def _secret() -> bytes:
    env_secret = os.getenv("AUTH_SECRET")
    if env_secret:
        return env_secret.encode("utf-8")
    if _VERCEL:
        # /tmp is per-instance on serverless, so a random file secret would
        # invalidate sessions between instances. Derive a stable one from a
        # secret that is already configured there.
        seed = os.getenv("GOOGLE_API_KEY")
        if seed:
            return hashlib.sha256(("eccbc-auth:" + seed).encode("utf-8")).digest()
    if not _SECRET_PATH.exists():
        _SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
    return _SECRET_PATH.read_text(encoding="utf-8").strip().encode("utf-8")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(_secret(), body.encode("ascii"), hashlib.sha256).digest())


def issue_token(user: dict) -> str:
    payload = {"sub": user["id"], "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{body}.{_sign(body)}"


def _read_token(token: str) -> Optional[dict]:
    try:
        body, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(body)):
            return None
        payload = json.loads(_unb64(body))
        if payload["exp"] < time.time():
            return None
        return payload
    except Exception:
        return None


def login(username: str, password: str) -> dict:
    users = _load_users()
    user = _find(users, username=(username or "").strip())
    # Same error for unknown user / wrong password / disabled account.
    if not user or not user["active"] or not _verify_password(password or "", user):
        raise HTTPException(401, "Identifiant ou mot de passe incorrect.")
    user["last_login_at"] = datetime.now().isoformat(timespec="seconds")
    _save_users(users)
    return {"token": issue_token(user), "user": public_user(user)}


# ----------------------------------------------------------- dependencies --
def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentification requise.")
    payload = _read_token(authorization[7:].strip())
    if not payload:
        raise HTTPException(401, "Session expirée ou invalide.")
    # Re-read the account on every request so role changes and deactivation
    # take effect immediately, not at token expiry.
    user = _find(_load_users(), user_id=payload["sub"])
    if not user or not user["active"]:
        raise HTTPException(401, "Compte désactivé ou supprimé.")
    return public_user(user)


def require_roles(*roles: str):
    def dependency(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Accès refusé pour ce rôle.")
        return user

    return dependency
