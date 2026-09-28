"""
FastAPI backend for the ECCBC Complaint Assistant.

Exposes endpoints for:
- Client Portal (Hybrid LLM + Logistic Regression complaint submission, RAG reply)
- Automated Email dispatch with PDF report attachment
- Department email management (add / remove routing contacts)
- Agent parameter configuration (Hybrid weighting, LR threshold, mode)
- Knowledge base indexing (PDF, Word, TXT, CSV)
- Root Cause Analysis & PDF report generation
"""
import datetime
import os
import pathlib
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai

from src.ingest import get_client as get_chroma_client, build_index, COLLECTION_NAME
from src.rag_chain import retrieve_context, generate_client_reply
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
    load_agent_config,
    save_agent_config,
    train_logistic_models
)
from src.mailer import send_ticket_notification, test_smtp_connection, get_smtp_config
from src.root_cause import run_root_cause_analysis
from src.root_cause_report import generate_root_cause_pdf
from src import storage

load_dotenv()

BASE_DIR = pathlib.Path(__file__).resolve().parent

app = FastAPI(title="ECCBC Complaint Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _genai_client() -> genai.Client:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(500, "Missing GOOGLE_API_KEY on the server (.env).")
    return genai.Client(api_key=api_key)


def _collection():
    return get_chroma_client().get_or_create_collection(COLLECTION_NAME)


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


# ------------------------------------------------------------- endpoints --
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- Knowledge Base ----
@app.post("/api/knowledge-base/rebuild")
def rebuild_kb():
    n = build_index()
    return {"chunks_indexed": n}


# ---- Departments & Routing ----
@app.get("/api/departments")
def get_departments():
    return load_departments()


@app.put("/api/departments")
def update_departments(payload: DepartmentsUpdateIn):
    save_departments(payload.departments)
    return {"status": "saved", "departments": load_departments()}


@app.post("/api/departments/{dept_key}/emails")
def add_email_to_dept(dept_key: str, payload: EmailIn):
    updated = add_department_email(dept_key, payload.email)
    return {"department": dept_key, "data": updated}


@app.delete("/api/departments/{dept_key}/emails")
def remove_email_from_dept(dept_key: str, payload: EmailIn):
    updated = remove_department_email(dept_key, payload.email)
    return {"department": dept_key, "data": updated}


# ---- Agent & Hybrid Classifier Configuration ----
@app.get("/api/agent/config")
def get_agent_config_endpoint():
    config = load_agent_config()
    return config


@app.post("/api/agent/config")
def update_agent_config_endpoint(payload: AgentConfigIn):
    current = load_agent_config()
    data = payload.model_dump(exclude_unset=True)
    current.update(data)
    save_agent_config(current)
    return {"status": "saved", "config": current}


@app.post("/api/agent/retrain")
def retrain_classifier():
    stats = train_logistic_models()
    return {"status": "success", "stats": stats}


# ---- Email Configuration & Testing ----
@app.get("/api/email/config")
def get_email_status():
    cfg = get_smtp_config()
    return {
        "enabled": cfg["enabled"],
        "host": cfg["host"],
        "port": cfg["port"],
        "from_email": cfg["from_email"],
        "has_credentials": bool(cfg["user"] and cfg["password"]),
        "user": cfg["user"][:4] + "***" if cfg["user"] else "not configured",
    }


@app.post("/api/email/test")
def test_email(payload: TestEmailIn):
    success, msg = test_smtp_connection(payload.recipient.strip())
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success", "message": msg}


# ---- Complaints & Ticketing ----
@app.post("/api/complaints")
def submit_complaint(payload: ComplaintIn):
    text = payload.complaint_text.strip()
    if not text:
        raise HTTPException(400, "complaint_text is empty.")

    client = _genai_client()
    collection = _collection()

    # 1. Hybrid classification (TF-IDF + Logistic Regression + Gemini 3 Flash)
    classification, meta = classify_hybrid(client, text)

    # 2. Context Retrieval from Chroma (reads Brand, ESG, and CSV Reviews)
    context_chunks = retrieve_context(collection, text)

    # 3. Client reply generation
    reply = generate_client_reply(client, text, context_chunks)

    # 4. Department routing contact
    dept = get_department_contact(classification.department)
    recipient_emails = dept.get("emails", [dept["contact_email"]])

    ticket = {
        "ticket_id": storage.new_ticket_id(),
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "complaint_text": text,
        "problem_type": classification.problem_type,
        "department": classification.department,
        "department_label": dept["label"],
        "department_email": dept["contact_email"],
        "department_emails": recipient_emails,
        "sentiment": classification.sentiment,
        "urgency": classification.urgency,
        "summary": classification.summary,
        "client_reply": reply,
        "context_used": context_chunks,
        "classification_meta": meta,
        "status": "open",
    }

    # 5. Generate structured PDF ticket (with ECCBC logo)
    pdf_path = str(BASE_DIR / "data" / "tickets_pdf" / f"{ticket['ticket_id']}.pdf")
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
    return ticket


@app.get("/api/tickets")
def list_tickets():
    return storage.list_tickets()


@app.patch("/api/tickets/{ticket_id}")
def update_ticket(ticket_id: str, payload: StatusIn):
    storage.update_status(ticket_id, payload.status)
    return {"ticket_id": ticket_id, "status": payload.status}


@app.get("/api/tickets/{ticket_id}/pdf")
def ticket_pdf(ticket_id: str):
    path = BASE_DIR / "data" / "tickets_pdf" / f"{ticket_id}.pdf"
    if not path.exists():
        raise HTTPException(404, "PDF not found.")
    return FileResponse(path, media_type="application/pdf", filename=path.name)


# ---- Root Cause Analysis ----
@app.post("/api/root-cause")
def root_cause(payload: RootCauseIn):
    client = _genai_client()
    tickets = storage.list_tickets()
    report = run_root_cause_analysis(client, tickets, min_count=payload.min_count, top_n=payload.top_n)

    generated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    filename = f"root_cause_{datetime.datetime.now():%Y%m%d_%H%M%S}.pdf"
    pdf_path = str(BASE_DIR / "data" / "root_cause_reports" / filename)
    generate_root_cause_pdf(report, generated_at, pdf_path)

    return {"report": report.model_dump(), "pdf_filename": filename}


@app.get("/api/root-cause/pdf/{filename}")
def root_cause_pdf(filename: str):
    path = BASE_DIR / "data" / "root_cause_reports" / filename
    if not path.exists():
        raise HTTPException(404, "PDF not found.")
    return FileResponse(path, media_type="application/pdf", filename=filename)
