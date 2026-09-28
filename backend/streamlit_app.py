"""
Entry point. Run with:  streamlit run app.py

Two views in one app:
- Client Portal: anyone submits a complaint, gets an immediate reply.
- Employee Dashboard: staff see every ticket, its classification, the
  auto-generated reply, and can download the structured PDF or change
  its status.
"""
import os
import pathlib
import datetime

import streamlit as st
from dotenv import load_dotenv
from google import genai

from src.ingest import get_client as get_chroma_client, build_index, COLLECTION_NAME
from src.classify import classify_complaint
from src.rag_chain import retrieve_context, generate_client_reply
from src.pdf_report import generate_ticket_pdf
from src.router import get_department_contact
from src.root_cause import run_root_cause_analysis
from src.root_cause_report import generate_root_cause_pdf
from src import storage

load_dotenv()

st.set_page_config(page_title="ECCBC Complaint Assistant", page_icon="🥤", layout="wide")

st.markdown(
    """
    <style>
    h1, h2, h3 { color: #F40009; }
    .stButton>button { background-color: #F40009; color: white; border: 0; }
    .stButton>button:hover { background-color: #C40007; color: white; }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource
def get_genai_client():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        st.error("Missing GOOGLE_API_KEY. Copy .env.example to .env and add your key.")
        st.stop()
    return genai.Client(api_key=api_key)


@st.cache_resource
def get_collection():
    return get_chroma_client().get_or_create_collection(COLLECTION_NAME)


genai_client = get_genai_client()
collection = get_collection()

st.sidebar.header("Knowledge base")
st.sidebar.caption("Rebuild after adding/editing files in data/knowledge_base/")
if st.sidebar.button("Rebuild knowledge base index"):
    with st.sidebar:
        with st.spinner("Indexing..."):
            n = build_index()
        st.success(f"Indexed {n} chunks.")
    collection = get_collection.clear()  # force re-fetch next run
    st.rerun()

st.title("🥤 ECCBC Post-Delivery Complaint Assistant")

tab_client, tab_employee, tab_root_cause = st.tabs(
    ["💬 Client Portal", "🗂️ Employee Dashboard", "📊 Root Cause Analysis"]
)

# ---------------------------------------------------------------- CLIENT --
with tab_client:
    st.subheader("Submit a complaint")
    complaint_text = st.text_area(
        "Describe the issue — French, English or Darija are all fine:",
        height=150,
        placeholder="e.g. J'ai reçu une bouteille qui fuyait hier soir...",
    )
    if st.button("Submit complaint", type="primary"):
        if not complaint_text.strip():
            st.warning("Please describe the issue first.")
        else:
            with st.spinner("Analyzing your complaint..."):
                classification = classify_complaint(genai_client, complaint_text)
                context_chunks = retrieve_context(collection, complaint_text)
                reply = generate_client_reply(genai_client, complaint_text, context_chunks)
                dept = get_department_contact(classification.department)

                ticket = {
                    "ticket_id": storage.new_ticket_id(),
                    "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
                    "complaint_text": complaint_text,
                    "problem_type": classification.problem_type,
                    "department": classification.department,
                    "department_label": dept["label"],
                    "department_email": dept["contact_email"],
                    "sentiment": classification.sentiment,
                    "urgency": classification.urgency,
                    "summary": classification.summary,
                    "client_reply": reply,
                    "context_used": context_chunks,
                    "status": "open",
                }
                pdf_path = str(pathlib.Path("data/tickets_pdf") / f"{ticket['ticket_id']}.pdf")
                generate_ticket_pdf(ticket, pdf_path)
                ticket["pdf_path"] = pdf_path
                storage.save_ticket(ticket)

            st.success(f"Thank you — your case has been logged as **#{ticket['ticket_id']}**.")
            st.markdown(reply)

# -------------------------------------------------------------- EMPLOYEE --
with tab_employee:
    st.subheader("Tickets")
    tickets = storage.list_tickets()
    if not tickets:
        st.info("No tickets yet — submit one from the Client Portal tab to see it here.")
    else:
        status_options = ["open", "in_progress", "resolved"]
        for t in tickets:
            title = f"#{t['ticket_id']} · {t['problem_type']} · {t['department_label']} · urgency: {t['urgency'].upper()} · {t['status']}"
            with st.expander(title):
                col1, col2 = st.columns([3, 1])
                with col1:
                    st.markdown(f"**Summary:** {t['summary']}")
                    st.markdown(f"**Sentiment:** {t['sentiment']}  |  **Route to:** {t['department_email']}")
                    st.markdown("**Original complaint**")
                    st.write(t["complaint_text"])
                    st.markdown("**Automated client-facing reply**")
                    st.write(t["client_reply"])
                with col2:
                    new_status = st.selectbox(
                        "Status",
                        status_options,
                        index=status_options.index(t["status"]),
                        key=f"status_{t['ticket_id']}",
                    )
                    if new_status != t["status"]:
                        storage.update_status(t["ticket_id"], new_status)
                        st.rerun()
                    if pathlib.Path(t["pdf_path"]).exists():
                        with open(t["pdf_path"], "rb") as f:
                            st.download_button(
                                "Download PDF ticket",
                                f,
                                file_name=f"{t['ticket_id']}.pdf",
                                key=f"pdf_{t['ticket_id']}",
                            )

# ----------------------------------------------------------- ROOT CAUSE --
with tab_root_cause:
    st.subheader("Find recurring patterns behind bad complaints")
    st.caption(
        "Reads every ticket Agent 1 has logged so far, groups the repeat offenders "
        "by problem type and department, and asks the model to explain the likely "
        "root cause behind each group — grounded in the actual complaint text."
    )
    all_tickets = storage.list_tickets()
    st.metric("Tickets available for analysis", len(all_tickets))

    col_a, col_b = st.columns(2)
    with col_a:
        min_count = st.number_input("Minimum complaints to count as a pattern", min_value=2, max_value=20, value=2)
    with col_b:
        top_n = st.number_input("Max number of patterns to report", min_value=1, max_value=10, value=5)

    if st.button("Run root cause analysis", type="primary"):
        if len(all_tickets) < min_count:
            st.warning("Not enough tickets yet — submit more complaints from the Client Portal first.")
        else:
            with st.spinner("Analyzing tickets..."):
                report = run_root_cause_analysis(genai_client, all_tickets, min_count=min_count, top_n=top_n)
                generated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                pdf_path = str(pathlib.Path("data/root_cause_reports") / f"root_cause_{datetime.datetime.now():%Y%m%d_%H%M%S}.pdf")
                generate_root_cause_pdf(report, generated_at, pdf_path)

            st.markdown("### Executive summary")
            st.write(report.overall_summary)

            if not report.findings:
                st.info("No pattern met the minimum-count threshold yet.")
            for i, finding in enumerate(report.findings, 1):
                with st.expander(f"Pattern {i} — {finding.cluster_label} ({finding.ticket_count} complaints)"):
                    st.markdown(f"**Likely root cause:** {finding.likely_root_cause}")
                    st.markdown("**Supporting evidence:**")
                    for ev in finding.supporting_evidence:
                        st.markdown(f"- {ev}")
                    st.markdown(f"**Recommended action:** {finding.recommended_action}")

            with open(pdf_path, "rb") as f:
                st.download_button("Download root cause report (PDF)", f, file_name=pathlib.Path(pdf_path).name)
