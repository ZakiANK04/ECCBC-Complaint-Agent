"""
Agent 2 — Root Cause Analysis.

Takes the bulk of tickets already produced by Agent 1 (the complaint
classifier/assistant, src/classify.py + src/storage.py) and finds the
recurring patterns behind them: which problem-type/department
combinations keep coming up, what's likely causing them based on the
actual complaint text, and what an employee should do about it.

Two stages, deliberately kept separate:
1. Quantitative clustering — plain counting, no ML dependency needed.
   Groups tickets by (problem_type, department) and ranks by frequency.
   This alone already answers "what are our biggest complaint buckets?"
2. Qualitative synthesis — an LLM reads the actual complaint texts in
   each of the top clusters and proposes a root cause, the evidence it
   used, and a recommended action. Grounded explicitly in the provided
   texts to reduce invented causes.
"""
from collections import defaultdict
from typing import List, Tuple
from pydantic import BaseModel
from google import genai
from google.genai import types

MAX_TICKETS_PER_CLUSTER_IN_PROMPT = 15  # keeps the prompt bounded on a big backlog


class RootCauseFinding(BaseModel):
    cluster_label: str
    ticket_count: int
    likely_root_cause: str
    supporting_evidence: list[str]
    recommended_action: str


class RootCauseReport(BaseModel):
    overall_summary: str
    findings: list[RootCauseFinding]


ROOT_CAUSE_SYSTEM_INSTRUCTION = """You are a data analyst supporting a
beverage bottling company's operations and quality teams. You will
receive several clusters of customer complaints that already share the
same problem type and department. For each cluster:
- Propose the single most likely underlying root cause, based only on
  the complaint texts given.
- List 2-4 short pieces of supporting evidence, quoting or closely
  paraphrasing the complaints that support your conclusion.
- Recommend one concrete, specific action an employee could take.
If the texts don't clearly point to a cause, say the evidence is
inconclusive and recommend what additional data would help instead of
guessing. Do not invent causes, dates, locations, or numbers that are
not present in the text you were given."""


def aggregate_clusters(
    tickets: List[dict], min_count: int = 2, top_n: int = 5
) -> List[Tuple[Tuple[str, str], List[dict]]]:
    """Groups tickets by (problem_type, department_label) and returns the
    top_n largest groups that have at least min_count tickets, largest
    first. Pure counting — no embeddings/ML needed for this first pass."""
    buckets = defaultdict(list)
    for t in tickets:
        key = (t["problem_type"], t["department_label"])
        buckets[key].append(t)
    ranked = sorted(buckets.items(), key=lambda kv: len(kv[1]), reverse=True)
    return [(k, v) for k, v in ranked if len(v) >= min_count][:top_n]


def _build_prompt(selected_clusters: List[Tuple[Tuple[str, str], List[dict]]]) -> str:
    parts = []
    for (problem_type, department), cluster_tickets in selected_clusters:
        parts.append(f"### Cluster: {problem_type} — {department} ({len(cluster_tickets)} complaints)")
        for t in cluster_tickets[:MAX_TICKETS_PER_CLUSTER_IN_PROMPT]:
            parts.append(f"- [{t['created_at']}] {t['summary']} | full text: {t['complaint_text'][:300]}")
    return "\n".join(parts)


def run_root_cause_analysis(
    client: genai.Client,
    tickets: List[dict],
    min_count: int = 2,
    top_n: int = 5,
    model: str = "gemini-3-flash-preview",
) -> RootCauseReport:
    selected = aggregate_clusters(tickets, min_count=min_count, top_n=top_n)
    if not selected:
        return RootCauseReport(
            overall_summary=(
                "Not enough repeated complaints in the same category yet to find a "
                "pattern — need at least a few tickets sharing the same problem type "
                "and department."
            ),
            findings=[],
        )

    response = client.models.generate_content(
        model=model,
        contents=_build_prompt(selected),
        config=types.GenerateContentConfig(
            system_instruction=ROOT_CAUSE_SYSTEM_INSTRUCTION,
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=RootCauseReport,
        ),
    )
    return RootCauseReport.model_validate_json(response.text)
