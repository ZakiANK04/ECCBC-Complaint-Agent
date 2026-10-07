"""
FastAPI backend for the ECCBC Complaint Assistant.

Exposes endpoints for:
- Client Portal (Hybrid LLM + Logistic Regression complaint submission, RAG reply)
- Message triage: complaints and order/delivery requests become tickets,
  information questions are answered from the knowledge base
- Automated Email dispatch with PDF report attachment
- Department email management (add / remove routing contacts)
- Agent parameter configuration (Hybrid weighting, LR threshold, mode)
- Knowledge base indexing (PDF, Word, TXT, CSV)
- Root Cause Analysis & PDF report generation
- Role-based access control (client / employee / admin) and account management
"""
import datetime
import os
import pathlib
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai

from src.ingest import (
    get_client as get_chroma_client,
    build_index,
    ensure_index,
    kb_files,
    read_any,
    COLLECTION_NAME,
    KB_DIR,
    UPLOAD_DIR,
    SUPPORTED_SUFFIXES,
)
from src.classify import ComplaintClassification
from src.intent import triage_message, triage_locally
from src.rag_chain import (
    retrieve_context,
    generate_client_reply,
    generate_local_client_reply,
    generate_request_reply,
    generate_local_request_reply,
    generate_info_reply,
    generate_local_info_reply,
)
from src.pdf_report import generate_ticket_pdf
from src.router import (
    get_department_contact,
    load_departments,
    save_departments,
    add_department_email,
    remove_department_email
)
from src.hybrid_classifier import (
    classify_hybrid,
    classify_locally,
    load_agent_config,
    save_agent_config,
    train_logistic_models
)
from src.mailer import send_ticket_notification, test_smtp_connection, get_smtp_config, save_smtp_config
from src.root_cause import run_root_cause_analysis
from src.root_cause_report import generate_root_cause_pdf
from src import auth, storage

load_dotenv()

BASE_DIR = pathlib.Path(__file__).resolve().parent
_VERCEL = bool(os.getenv("VERCEL"))


def _tickets_pdf_dir() -> pathlib.Path:
    d = pathlib.Path("/tmp/eccbc/data/tickets_pdf") if _VERCEL else BASE_DIR / "data" / "tickets_pdf"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _rca_pdf_dir() -> pathlib.Path:
    d = pathlib.Path("/tmp/eccbc/data/root_cause_reports") if _VERCEL else BASE_DIR / "data" / "root_cause_reports"
    d.mkdir(parents=True, exist_ok=True)
    return d

app = FastAPI(title="ECCBC Complaint Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _genai_client() -> Optional[genai.Client]:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return None
    return genai.Client(api_key=api_key)


def _collection():
    ensure_index()
    return get_chroma_client().get_or_create_collection(COLLECTION_NAME)


KB_MAX_UPLOAD_BYTES = int(float(os.getenv("KB_MAX_UPLOAD_MB", "25")) * 1024 * 1024)


def _kb_status() -> dict:
    files = [
        {
            "name": f.name,
            "size": f.stat().st_size,
            "type": f.suffix.lower().lstrip("."),
            # Files shipped in a read-only bundle cannot be removed from the UI.
            "deletable": f.parent == UPLOAD_DIR,
        }
        for f in kb_files()
    ]
    try:
        chunks = get_chroma_client().get_or_create_collection(COLLECTION_NAME).count()
    except Exception:
        chunks = 0
    return {"files": files, "chunks_indexed": chunks, "max_upload_bytes": KB_MAX_UPLOAD_BYTES}


def _kb_filename(filename: str) -> str:
    name = pathlib.PurePath(filename.replace("\\", "/")).name.strip()
    if not name or name != filename.strip() or name.startswith("."):
        raise HTTPException(400, "Nom de fichier invalide.")
    if pathlib.PurePath(name).suffix.lower() not in SUPPORTED_SUFFIXES:
        raise HTTPException(400, "Format non pris en charge. Formats acceptés : PDF, DOCX, TXT, MD, CSV.")
    return name


# Outcome of the most recent language-model calls, shown to admins so a
# quota or key problem is visible instead of silently degrading replies.
_llm_health = {"last_ok_at": None, "last_error_at": None, "last_error": None, "last_result": None}


def _llm(call, *args, **kwargs):
    """Run one language-model call and record whether it worked."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    try:
        result = call(*args, **kwargs)
    except Exception as exc:
        _llm_health.update(last_error_at=now, last_error=str(exc), last_result="error")
        raise
    _llm_health.update(last_ok_at=now, last_result="ok")
    return result


def _llm_error_kind(message: Optional[str]) -> Optional[str]:
    if not message:
        return None
    low = message.lower()
    if "429" in low or "resource_exhausted" in low or "quota" in low:
        return "quota"
    if "api key" in low or "api_key" in low or "401" in low or "403" in low or "permission" in low:
        return "key"
    return "other"


# ---------------------------------------------------------- access rules --
any_user = Depends(auth.current_user)
chat_user = Depends(auth.require_roles("client", "admin"))
staff_user = Depends(auth.require_roles("employee", "admin"))
admin_user = Depends(auth.require_roles("admin"))

TICKET_STATUSES = ("open", "in_progress", "resolved")
# What a client may see of a ticket: no internal routing addresses,
# classifier internals or retrieved knowledge-base passages.
_CLIENT_TICKET_FIELDS = (
    "ticket_id", "created_at", "complaint_text", "problem_type", "department",
    "department_label", "urgency", "summary", "client_reply", "status", "status_updated_at",
    "ticket_type",
)


def _client_view(ticket: dict) -> dict:
    view = {k: ticket.get(k) for k in _CLIENT_TICKET_FIELDS}
    view["ticket_type"] = view["ticket_type"] or "complaint"
    return view


def _email_status() -> dict:
    cfg = get_smtp_config()
    return {
        "enabled": cfg["enabled"],
        "host": cfg["host"],
        "port": cfg["port"],
        "from_email": cfg["from_email"],
        "use_tls": cfg["use_tls"],
        "has_credentials": bool(cfg["user"] and cfg["password"]),
        "has_password": bool(cfg["password"]),
        "smtp_user": cfg["user"],
        "user": cfg["user"][:4] + "***" if cfg["user"] else "not configured",
    }


# --------------------------------------------------------------- models --
class ComplaintIn(BaseModel):
    complaint_text: str


class StatusIn(BaseModel):
    status: str


class RootCauseIn(BaseModel):
    min_count: int = 2
    top_n: int = 5


class EmailIn(BaseModel):
    email: str


class TestEmailIn(BaseModel):
    recipient: str


class AgentConfigIn(BaseModel):
    classification_mode: Optional[str] = None
    lr_confidence_threshold: Optional[float] = None
    lr_weight: Optional[float] = None
    model_name: Optional[str] = None


class DepartmentsUpdateIn(BaseModel):
    departments: dict


class EmailConfigIn(BaseModel):
    enabled: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    use_tls: Optional[bool] = None


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class UserCreateIn(BaseModel):
    username: str
    password: str
    name: str
    role: str
    email: str = ""
    company: str = ""


class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None


# ------------------------------------------------------------- endpoints --
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- Authentication & Accounts ----
@app.post("/api/auth/login")
def login(payload: LoginIn):
    return auth.login(payload.username, payload.password)


@app.get("/api/auth/me")
def me(user: dict = any_user):
    return user


@app.get("/api/auth/demo-accounts")
def demo_accounts():
    return auth.demo_accounts()


@app.post("/api/auth/password")
def change_password(payload: PasswordChangeIn, user: dict = any_user):
    auth.change_own_password(user, payload.current_password, payload.new_password)
    return {"status": "saved"}


@app.get("/api/users")
def list_users(_: dict = admin_user):
    return auth.list_users()


@app.post("/api/users")
def create_user(payload: UserCreateIn, _: dict = admin_user):
    return auth.create_user(**payload.model_dump())


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdateIn, user: dict = admin_user):
    return auth.update_user(user_id, payload.model_dump(exclude_unset=True), user)


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, user: dict = admin_user):
    auth.delete_user(user_id, user)
    return {"status": "deleted", "id": user_id}


# ---- Knowledge Base ----
@app.get("/api/knowledge-base")
def knowledge_base_status(_: dict = admin_user):
    return _kb_status()


@app.put("/api/knowledge-base/files/{filename}")
def upload_kb_file(
    filename: str,
    content: bytes = Body(..., media_type="application/octet-stream"),
    _: dict = admin_user,
):
    """Adds (or replaces) one document, then re-indexes. The file is sent as
    the raw request body so no multipart dependency is needed."""
    name = _kb_filename(filename)
    if not content:
        raise HTTPException(400, "Le fichier est vide.")
    if len(content) > KB_MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Fichier trop volumineux (maximum {KB_MAX_UPLOAD_BYTES // (1024 * 1024)} Mo).")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / name
    previous = target.read_bytes() if target.exists() else None
    target.write_bytes(content)
    try:
        # Reject documents the indexer cannot read (corrupt or scanned-image PDFs…).
        if not read_any(target).strip():
            raise ValueError("no text")
    except Exception:
        if previous is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(previous)
        raise HTTPException(400, "Aucun texte lisible dans ce fichier (document corrompu ou numérisé en image).")

    build_index()
    return {**_kb_status(), "uploaded": name, "replaced": previous is not None}


@app.delete("/api/knowledge-base/files/{filename}")
def delete_kb_file(filename: str, _: dict = admin_user):
    name = _kb_filename(filename)
    target = UPLOAD_DIR / name
    if not target.is_file():
        if (KB_DIR / name).is_file():
            raise HTTPException(400, "Ce document fait partie du déploiement et ne peut pas être supprimé ici.")
        raise HTTPException(404, "Document introuvable.")
    target.unlink()
    build_index()
    return {**_kb_status(), "deleted": name}


@app.post("/api/knowledge-base/rebuild")
def rebuild_kb(_: dict = admin_user):
    n = build_index()
    return {"chunks_indexed": n}


# ---- Departments & Routing ----
@app.get("/api/departments")
def get_departments(_: dict = admin_user):
    return load_departments()


@app.put("/api/departments")
def update_departments(payload: DepartmentsUpdateIn, _: dict = admin_user):
    save_departments(payload.departments)
    return {"status": "saved", "departments": load_departments()}


@app.post("/api/departments/{dept_key}/emails")
def add_email_to_dept(dept_key: str, payload: EmailIn, _: dict = admin_user):
    if "@" not in payload.email:
        raise HTTPException(400, "Adresse e-mail invalide.")
    updated = add_department_email(dept_key, payload.email)
    return {"department": dept_key, "data": updated}


@app.delete("/api/departments/{dept_key}/emails")
def remove_email_from_dept(dept_key: str, payload: EmailIn, _: dict = admin_user):
    updated = remove_department_email(dept_key, payload.email)
    return {"department": dept_key, "data": updated}


# ---- Agent & Hybrid Classifier Configuration ----
@app.get("/api/agent/config")
def get_agent_config_endpoint(_: dict = admin_user):
    config = load_agent_config()
    return config


@app.post("/api/agent/config")
def update_agent_config_endpoint(payload: AgentConfigIn, _: dict = admin_user):
    current = load_agent_config()
    data = payload.model_dump(exclude_unset=True)
    current.update(data)
    save_agent_config(current)
    return {"status": "saved", "config": current}


@app.get("/api/agent/status")
def agent_status(_: dict = admin_user):
    failing = _llm_health["last_result"] == "error"
    return {
        "configured": _genai_client() is not None,
        "state": {"ok": "ok", "error": "failing"}.get(_llm_health["last_result"], "unknown"),
        "error_kind": _llm_error_kind(_llm_health["last_error"]) if failing else None,
        "last_error": (_llm_health["last_error"] or "")[:600] if failing else None,
        **{k: _llm_health[k] for k in ("last_ok_at", "last_error_at")},
    }


@app.post("/api/agent/retrain")
def retrain_classifier(_: dict = admin_user):
    stats = train_logistic_models()
    return {"status": "success", "stats": stats}


# ---- Email Configuration & Testing ----
@app.get("/api/email/config")
def get_email_status(_: dict = admin_user):
    return _email_status()


@app.put("/api/email/config")
def update_email_config(payload: EmailConfigIn, _: dict = admin_user):
    data = payload.model_dump(exclude_unset=True)
    if data.get("port") is not None and not (1 <= data["port"] <= 65535):
        raise HTTPException(400, "Port SMTP invalide.")
    save_smtp_config(data)
    return _email_status()


@app.post("/api/email/test")
def test_email(payload: TestEmailIn, _: dict = admin_user):
    success, msg = test_smtp_connection(payload.recipient.strip())
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success", "message": msg}


# ---- Complaints & Ticketing ----
@app.post("/api/complaints")
def submit_complaint(payload: ComplaintIn, user: dict = chat_user):
    text = payload.complaint_text.strip()
    if not text:
        raise HTTPException(400, "complaint_text is empty.")

    client = _genai_client()
    model_name = load_agent_config().get("model_name", "gemini-3-flash-preview")

    # 0. Triage: complaint, request (needs a human) or information question
    triage, triage_meta = None, {}
    if client:
        try:
            triage = _llm(triage_message, client, text, model=model_name)
            triage_meta = {"triage": "llm"}
        except Exception as exc:
            triage_meta = {"triage_fallback_reason": str(exc)}
    if triage is None:
        triage, reason = triage_locally(text)
        triage_meta = {**triage_meta, "triage": f"local_keywords ({reason})"}
    triaged_by_llm = triage_meta.get("triage") == "llm"

    # Context retrieval from the knowledge base (brand, ESG, CSV reviews, uploads)
    try:
        context_chunks = retrieve_context(_collection(), text)
    except Exception:
        # Knowledge-base indexing is optional for first-run/offline use.
        context_chunks = []

    # Information questions are answered directly: nothing to route, no ticket.
    if triage.intent == "information":
        reply = None
        if client:
            try:
                reply = _llm(generate_info_reply, client, text, context_chunks, model=model_name)
            except Exception:
                reply = None
        return {
            "kind": "answer",
            "ticket_id": None,
            "client_reply": reply or generate_local_info_reply(text),
            "grounded": bool(reply and context_chunks),
            "generated": bool(reply),
        }

    if triage.intent == "request":
        # 1. Requests carry no urgency and skip the complaint classifier.
        classification = ComplaintClassification(
            problem_type=triage.category.strip() or "Request",
            department=triage.department,
            sentiment=triage.sentiment,
            urgency="medium",
            summary=triage.summary,
        )
        meta = {"mode": "request_triage", "decision": "request (routed from triage)", **triage_meta}
        reply = None
        if client:
            try:
                reply = _llm(generate_request_reply, client, text, context_chunks, model=model_name)
            except Exception as exc:
                meta["reply_fallback_reason"] = str(exc)
        reply = reply or generate_local_request_reply(text)
    else:
        # 1. Hybrid classification (TF-IDF + Logistic Regression + Gemini 3 Flash)
        # The triage call already returned the LLM's reading of the complaint,
        # so it is reused here instead of asking the model a second time.
        llm_reading = None
        if triaged_by_llm:
            llm_reading = ComplaintClassification(
                problem_type=triage.category.strip() or "Complaint",
                department=triage.department,
                sentiment=triage.sentiment,
                urgency=triage.urgency,
                summary=triage.summary,
            )
        if client:
            try:
                if llm_reading is None and load_agent_config().get("classification_mode") != "lr_only":
                    classification, meta = _llm(classify_hybrid, client, text)
                else:
                    classification, meta = classify_hybrid(client, text, llm_classification=llm_reading)
            except Exception as exc:
                # A configured key can still be unavailable (offline development,
                # expired credentials, quota, or provider outage). Ticketing must
                # remain available in that case.
                classification, meta = classify_locally(text)
                meta["decision"] = "local_logistic_regression (LLM unavailable)"
                meta["llm_fallback_reason"] = str(exc)
        else:
            classification, meta = classify_locally(text)
        meta = {**meta, "triage": triage_meta.get("triage")}

        # 3. Client reply generation. Tried on its own even if classification
        # fell back, so one failed call does not degrade the whole answer.
        reply = None
        if client:
            try:
                reply = _llm(generate_client_reply, client, text, context_chunks, model=model_name)
            except Exception as exc:
                meta["reply_fallback_reason"] = str(exc)
        reply = reply or generate_local_client_reply(text)

    is_request = triage.intent == "request"

    # 4. Department routing contact
    dept = get_department_contact(classification.department)
    recipient_emails = dept.get("emails", [dept["contact_email"]])

    ticket = {
        "ticket_id": storage.new_ticket_id(),
        "ticket_type": "request" if is_request else "complaint",
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "complaint_text": text,
        "problem_type": classification.problem_type,
        "department": classification.department,
        "department_label": dept["label"],
        "department_email": dept["contact_email"],
        "department_emails": recipient_emails,
        "sentiment": classification.sentiment,
        "urgency": None if is_request else classification.urgency,
        "summary": classification.summary,
        "client_reply": reply,
        "context_used": context_chunks,
        "classification_meta": meta,
        "status": "open",
        "created_by": user["username"],
        "client_name": user["name"],
        "client_company": user.get("company", ""),
    }

    # 5. Generate structured PDF ticket (with ECCBC logo)
    pdf_path = str(_tickets_pdf_dir() / f"{ticket['ticket_id']}.pdf")
    generate_ticket_pdf(ticket, pdf_path)
    ticket["pdf_path"] = pdf_path

    # 6. Real Automated Email Notification with PDF attached
    email_sent, email_msg = send_ticket_notification(ticket, pdf_path, recipient_emails)
    ticket["email_dispatch"] = {
        "sent": email_sent,
        "message": email_msg,
        "recipients": recipient_emails
    }

    storage.save_ticket(ticket)
    view = _client_view(ticket) if user["role"] == "client" else ticket
    return {**view, "kind": ticket["ticket_type"]}


@app.get("/api/tickets")
def list_tickets(_: dict = staff_user):
    return storage.list_tickets()


@app.get("/api/tickets/mine")
def my_tickets(user: dict = any_user):
    return [_client_view(t) for t in storage.list_tickets() if t.get("created_by") == user["username"]]


@app.patch("/api/tickets/{ticket_id}")
def update_ticket(ticket_id: str, payload: StatusIn, user: dict = staff_user):
    if payload.status not in TICKET_STATUSES:
        raise HTTPException(400, f"Statut inconnu : {payload.status}.")
    if not storage.update_status(ticket_id, payload.status, updated_by=user["username"]):
        raise HTTPException(404, "Ticket introuvable.")
    return {"ticket_id": ticket_id, "status": payload.status}


@app.get("/api/tickets/{ticket_id}/pdf")
def ticket_pdf(ticket_id: str, user: dict = any_user):
    ticket = storage.get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket introuvable.")
    if user["role"] == "client" and ticket.get("created_by") != user["username"]:
        raise HTTPException(403, "Accès refusé pour ce rôle.")
    path = _tickets_pdf_dir() / f"{ticket_id}.pdf"
    if not path.exists():
        # Generated files do not survive a serverless cold start; rebuild on demand.
        generate_ticket_pdf(ticket, str(path))
    return FileResponse(path, media_type="application/pdf", filename=path.name)


# ---- Root Cause Analysis ----
@app.post("/api/root-cause")
def root_cause(payload: RootCauseIn, _: dict = staff_user):
    client = _genai_client()
    # Root causes are about problems: requests are left out.
    tickets = [t for t in storage.list_tickets() if t.get("ticket_type") != "request"]
    try:
        report = _llm(
            run_root_cause_analysis, client, tickets, min_count=payload.min_count, top_n=payload.top_n,
            model=load_agent_config().get("model_name", "gemini-3-flash-preview"),
        ) if client else run_root_cause_analysis(None, tickets, min_count=payload.min_count, top_n=payload.top_n)
    except Exception:
        report = run_root_cause_analysis(None, tickets, min_count=payload.min_count, top_n=payload.top_n)

    generated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    filename = f"root_cause_{datetime.datetime.now():%Y%m%d_%H%M%S}.pdf"
    pdf_path = str(_rca_pdf_dir() / filename)
    generate_root_cause_pdf(report, generated_at, pdf_path)

    return {"report": report.model_dump(), "pdf_filename": filename}


@app.get("/api/root-cause/pdf/{filename}")
def root_cause_pdf(filename: str, _: dict = staff_user):
    path = _rca_pdf_dir() / filename
    if path.name != filename or not path.is_file():
        raise HTTPException(404, "PDF not found.")
    return FileResponse(path, media_type="application/pdf", filename=filename)
