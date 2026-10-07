# ECCBC Complaint Assistant — Hybrid AI System

A production-grade prototype for My September Internship : ** Post-Delivery AI Complaint Assistant, RAG System & Automated Routing** developed for **Equatorial Coca-Cola Bottling Company (ECCBC) — Fruital Rouiba Division**.

The system features cooperating AI agents with a modern, branded interface:
- **Agent 1 — Hybrid Complaint Assistant**: Multi-modal triage combining **TF-IDF + Logistic Regression** (classic ML) with **Google Gemini 3 Flash Preview** (LLM), automated grounded RAG replies in French, English, and Algerian Darija, branded PDF ticketing, and real-time automated email dispatch to department routing contacts.
- **Agent 2 — Root Cause Analysis**: Evaluates historical ticket clusters to uncover root causes and generate executive decision-support PDF reports.
- **Admin & Department Management**: Live dashboard controls to configure hybrid ML/LLM weights, retrain the local ML model online, add/remove department recipient emails dynamically, test SMTP notifications, and rebuild vector embeddings from PDFs, Word docs, and scraped CSV reviews.

Two interfaces sit on top of the same backend:
- **`frontend/` (React 19 + Tailwind CSS + Recharts + Lucide)**: WhatsApp/Telegram-style discussion window with real-time delivery ticks (`✓` sent, `✓✓` delivered, `✓✓` read), live typing indicator, interactive ticket attachments, and an Admin Settings dashboard.
- **`backend/streamlit_app.py`**: Quick fallback single-file demo.

---

## 1. Architecture

```
                 ┌────────────────────────────────────────────────────────┐
                 │                  data/knowledge_base                   │
                 │  (Brandbook.pdf, ESG_Report.pdf, scraped reviews.csv)   │
                 └───────────────────────────┬────────────────────────────┘
                                             │  src/ingest.py (chunk + embed)
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │                 Chroma Vector Database                 │
                 │                  (eccbc_knowledge)                     │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                                             │  RAG context retrieval
                                             ▼
  Client Complaint ──► src/hybrid_classifier.py ──► Hybrid Classification
        │              ├─ TF-IDF + Logistic Regression (Local ML)
        │              └─ Google Gemini 3 Flash Preview (LLM)
        │
        ├──► src/rag_chain.py ──► Grounded Client Reply (French/English/Darija)
        │
        ├──► src/pdf_report.py ──► Official PDF Ticket (with ECCBC Logo)
        │
        └──► src/mailer.py ─────► Automated SMTP Notification (PDF attached)
                                             │
                                             ▼
                             data/tickets.json + data/tickets_pdf/*.pdf
                                             │
                                             ▼
                             src/root_cause.py (Agent 2 Clustering & Synthesis)
                                             │
                                             ▼
                             src/root_cause_report.py ──► PDF Report
                                             │
                       ┌─────────────────────┴──────────────────────┐
                       ▼                                            ▼
               backend/main.py (FastAPI JSON API)        backend/streamlit_app.py
                       │
                       ▼
               frontend/ (React + Tailwind CSS)
               Client Portal · Dashboard · Root Cause · Admin Settings
```

---

## 2. Key Features

1. **Hybrid Classification Engine (`src/hybrid_classifier.py`)**:
   - Parametrable blend between TF-IDF + Logistic Regression and Gemini 3 Flash Preview.
   - Configurable modes: `Hybrid` (Ensemble), `LLM Only`, or `Logistic Regression Only` (runs 100% on CPU with zero API costs).
   - Adjustable confidence threshold and weight slider directly in the Admin Dashboard.
   - Online re-training button to update the Logistic Regression model using newly submitted tickets.

2. **Automated Department Routing & Dynamic Email Management (`src/router.py`)**:
   - Routes complaints to `Quality`, `Logistics`, `Commercial`, `Billing`, or `Other`.
   - Admin dashboard allows adding and removing email recipients per department with instant YAML persistence.

3. **Real Automated Email Dispatch (`src/mailer.py`)**:
   - Sends high-priority HTML notifications with the official generated PDF ticket attached directly to responsible department personnel.
   - Built-in SMTP connection tester and setup diagnostics.

4. **Expanded Knowledge Base with CSV Reviews (`src/ingest.py`)**:
   - Ingests `.pdf`, `.docx`, `.txt`, and `.csv` files (e.g. `coca_cola_full_reviews.csv`).
   - Cleans and indexes scraped consumer reviews to ground the RAG engine in real post-delivery feedback.

5. **WhatsApp / Telegram Discussion Interface (`frontend/src/components/ClientPortal.jsx`)**:
   - Sent, Delivered, and Read status ticks.
   - Smooth animated 3-dot typing indicator (*"en train d'écrire..."*).
   - Rich ticket attachment card inside the chat stream with direct PDF download.
   - Multi-lingual quick suggestions in French and Algerian Darija.

---

## 3. Quick Start (Local Run)

### Prerequisites
- Python 3.10+
- Node.js 18+
- Gemini API Key ([Google AI Studio](https://aistudio.google.com/app/apikey))

### Step 1: Backend Setup
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and paste your GOOGLE_API_KEY
```

Build the vector database index:
```bash
python -m src.ingest
```

Run the FastAPI backend:
```bash
python -m uvicorn main:app --reload --port 8000
```
Backend will be available at: `http://127.0.0.1:8000` (Docs: `http://127.0.0.1:8000/docs`).

### Step 2: Frontend Setup
In a new terminal:
```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Accounts and roles

The app requires sign-in. Three starter accounts are created on first run (stored in `backend/data/users.json`, not committed):

| Role | Username | Password | Access |
|---|---|---|---|
| Client | `client` | `Client@2026` | Assistant chat and their own tickets |
| Employee | `employee` | `Employee@2026` | Dashboard, root cause analysis |
| Admin | `admin` | `Admin@2026` | Everything, plus settings and account management |

The interface is available in French and English (switch in the sidebar, the top bar and the login screen). French is the source language; English strings live in `frontend/src/lib/en.js`.

The assistant triages every client message (`backend/src/intent.py`):

| Message | What happens |
|---|---|
| Complaint | Full pipeline: hybrid classification, ticket, PDF, department e-mail |
| Request (orders, deliveries) | Ticket of type `request` routed to a department, without urgency; left out of root cause analysis and of ML retraining |
| Information question | Answered from the knowledge base, no ticket |

Admins can add or remove knowledge-base documents (PDF, DOCX, TXT, MD, CSV) under Settings → Knowledge base; the index is rebuilt on each change. `KB_MAX_UPLOAD_MB` sets the size limit (default 25).

The API enforces the same rules as the UI. Before deploying, set `AUTH_SECRET`, change these passwords (or set `DEMO_*_PASSWORD`), and set `DEMO_ACCOUNTS=false` to stop the login screen from listing them — see `backend/.env.example`.

---

## 4. Configuring Real Automated Emails (SMTP)

To enable automated email notifications with attached PDF tickets:
1. Open `backend/.env`.
2. Set `SMTP_ENABLED=true`.
3. If using **Gmail**:
   - Enable 2-Step Verification in your Google Account.
   - Go to **Security > App passwords**.
   - Create an app password named "ECCBC Assistant" (16 characters).
   - Fill in:
     ```ini
     SMTP_HOST=smtp.gmail.com
     SMTP_PORT=587
     SMTP_USER=your_email@gmail.com
     SMTP_PASSWORD=your_16_digit_app_password
     SMTP_FROM="ECCBC Assistant <your_email@gmail.com>"
     SMTP_USE_TLS=true
     ```
4. Test the configuration under the **Paramètres Agent** tab in the dashboard using the built-in email test tool.

---

## 5. Deployment Guide: GitHub & Vercel

### Safe Push to GitHub
A robust `.gitignore` is provided to ensure sensitive secrets (`.env`), vector stores (`chroma_store`), dependencies (`node_modules`, `venv`), and compiled caches are never committed:

```bash
# Verify git status
git status

# Add files and commit
git add .
git commit -m "feat: hybrid classification, dynamic routing, automated emails and CSV ingest"

# Push to your repository
git remote add origin https://github.com/ZakiANK04/eccbc-complaint-assistant.git
git branch -M main
git push -u origin main
```

### Hosting on Vercel
1. Log in to [Vercel](https://vercel.com) and click **Add New > Project**.
2. Select your imported GitHub repository (`ZakiANK04/eccbc-complaint-assistant`).
3. Set the **Root Directory** to `frontend` (or use the root `vercel.json`).
4. In **Environment Variables**, add:
   - `VITE_API_BASE_URL`: The public URL of your deployed FastAPI backend (e.g. on Render, Railway, or VPS).
5. Click **Deploy**.

---

## 6. Project Structure

```
├── .gitignore                      # Safe Git exclusions (.env, node_modules, binaries)
├── ECCBC.png                       # Official circular ECCBC brand logo
├── vercel.json                     # Vercel deployment configuration
├── backend/
│   ├── assets/
│   │   └── ECCBC.png               # Official brand logo for PDF reports
│   ├── config/
│   │   ├── agent_config.json       # Hybrid weights & threshold configuration
│   │   └── departments.yaml        # Dynamic department routing contacts
│   ├── data/
│   │   ├── knowledge_base/         # PDFs, DOCX, TXT, and scraped reviews CSV
│   │   ├── tickets.json            # JSON ticket store
│   │   └── tickets_pdf/            # Generated official PDF tickets
│   ├── src/
│   │   ├── classify.py             # LLM Pydantic classification schema
│   │   ├── hybrid_classifier.py    # TF-IDF + Logistic Regression + Gemini Ensemble
│   │   ├── ingest.py               # Multi-format knowledge base chunker & embedder
│   │   ├── mailer.py               # Automated SMTP dispatcher with PDF attachments
│   │   ├── pdf_report.py           # ReportLab PDF ticket generator (branded)
│   │   ├── rag_chain.py            # RAG context retriever & client response generator
│   │   ├── root_cause.py           # Agent 2 pattern clustering & synthesis
│   │   ├── root_cause_report.py    # ReportLab root cause PDF report generator
│   │   ├── router.py               # Department contacts CRUD & routing logic
│   │   └── storage.py              # File-based ticket persistence
│   ├── main.py                     # FastAPI application
│   ├── requirements.txt            # Python dependencies
│   └── streamlit_app.py            # Fallback Streamlit prototype
└── frontend/
    ├── public/
    │   └── eccbc-logo.png          # Official ECCBC logo
    ├── src/
    │   ├── components/
    │   │   ├── AdminSettings.jsx   # Hybrid parameters, dynamic routing & SMTP test
    │   │   ├── ClientPortal.jsx    # WhatsApp-style chat with delivery ticks
    │   │   ├── EmployeeDashboard.jsx # Analytics, chart & ticket triage
    │   │   ├── Header.jsx          # Branded header with logo & navigation tabs
    │   │   ├── RootCauseAnalysis.jsx # Agent 2 root-cause investigation
    │   │   └── TicketCard.jsx      # Ticket detail with hybrid scores & PDF link
    │   ├── api.js                  # Frontend API client
    │   └── index.css               # Tailwind CSS styles & chat animations
    └── package.json
```

---

## 7. Academic & Internship Context
- **Candidate**: Aouanouk Ahcene Zakaria (Final-year Engineering Student, Data Science & AI, ENP Alger)
- **Company**: Equatorial Coca-Cola Bottling Company (ECCBC) — Fruital Rouiba Division
- **Framework**: Hybrid AI (Statistical Machine Learning + Generative AI & Retrieval-Augmented Generation)
