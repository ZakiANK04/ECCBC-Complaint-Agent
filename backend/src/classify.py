"""
Step 2: classify a raw complaint into problem type, department, sentiment
and urgency, using the LLM with a strict JSON schema so the output is
always machine-readable (no regex-parsing of free text).
"""
from typing import Literal
from pydantic import BaseModel
from google import genai
from google.genai import types

DEPARTMENT_KEYS = Literal["quality", "logistics", "commercial", "billing", "other"]

CLASSIFY_SYSTEM_INSTRUCTION = """You are a complaint-triage assistant for a
beverage bottling company (ECCBC / Coca-Cola). Read the customer complaint,
written in French, English, or Algerian Darija, and classify it strictly
according to the given schema. Be conservative: if unsure, prefer "other"
for department and "medium" for urgency rather than guessing confidently."""


class ComplaintClassification(BaseModel):
    problem_type: str          # short free-text label, e.g. "damaged product", "late delivery"
    department: DEPARTMENT_KEYS
    sentiment: Literal["positive", "neutral", "negative"]
    urgency: Literal["low", "medium", "high"]
    summary: str                # one-sentence neutral summary of the complaint


def classify_complaint(client: genai.Client, complaint_text: str, model: str = "gemini-3-flash-preview") -> ComplaintClassification:
    response = client.models.generate_content(
        model=model,
        contents=f"Customer complaint:\n\"\"\"\n{complaint_text}\n\"\"\"",
        config=types.GenerateContentConfig(
            system_instruction=CLASSIFY_SYSTEM_INSTRUCTION,
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=ComplaintClassification,
        ),
    )
    return ComplaintClassification.model_validate_json(response.text)
