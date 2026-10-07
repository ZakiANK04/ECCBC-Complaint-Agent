"""
Step 0: decide what a client message is before running a pipeline on it.

- complaint   : reports a problem. Goes through the full complaint pipeline
                (hybrid classification, ticket, PDF, department e-mail).
- request     : asks ECCBC to do something, mainly about orders and
                deliveries. Needs a human, so it becomes a ticket too.
- information : a question that can be answered from the knowledge base,
                or small talk. Answered directly, no ticket.
"""
from typing import Literal, Tuple

from pydantic import BaseModel
from google import genai
from google.genai import types

from src.classify import DEPARTMENT_KEYS

INTENTS = ("complaint", "request", "information")


class MessageTriage(BaseModel):
    intent: Literal["complaint", "request", "information"]
    category: str               # short label, e.g. "New order", "Delivery date inquiry"
    department: DEPARTMENT_KEYS
    sentiment: Literal["positive", "neutral", "negative"]
    urgency: Literal["low", "medium", "high"]
    summary: str                # one-sentence neutral summary


TRIAGE_SYSTEM_INSTRUCTION = """You triage messages sent by clients (shops,
distributors) to a beverage bottling company (ECCBC / Coca-Cola). Messages
are written in French, English, or Algerian Darija. Classify the message
strictly according to the given schema.

intent:
- "complaint": the client reports a problem or dissatisfaction (damaged,
  missing, expired or wrong product, late or failed delivery, billing
  error, bad service).
- "request": the client asks the company to DO something that needs a staff
  member, mainly about orders and deliveries: place, change or cancel an
  order, schedule a delivery, ask when a specific order will arrive.
- "information": a general question that documentation can answer
  (products, the company, policies, opening hours), or a greeting, thanks
  or small talk.
If a message both reports a problem and asks for something, choose
"complaint". If unsure between "request" and "information", choose
"request" when the answer depends on the client's own orders or account.

category: a short English label for the subject (2-4 words), for a
complaint the type of problem (e.g. "Damaged product", "Late delivery").
urgency: how quickly it needs attention. Be conservative: prefer "medium"
when unsure; "high" for safety issues, contamination, or a client left
without stock.
department: who should handle it. Orders usually go to "commercial",
delivery scheduling to "logistics"; use "other" when unsure.
summary: one neutral sentence in English."""


def triage_message(client: genai.Client, text: str, model: str = "gemini-3-flash-preview") -> MessageTriage:
    response = client.models.generate_content(
        model=model,
        contents=f"Client message:\n\"\"\"\n{text}\n\"\"\"",
        config=types.GenerateContentConfig(
            system_instruction=TRIAGE_SYSTEM_INSTRUCTION,
            temperature=0.1,
            response_mime_type="application/json",
            response_schema=MessageTriage,
        ),
    )
    return MessageTriage.model_validate_json(response.text)


# ------------------------------------------------------- offline fallback --
_COMPLAINT_TERMS = (
    "cass", "abîm", "abim", "endommag", "fuit", "fuite", "périm", "perim", "manqu", "retard",
    "erreur", "défect", "defect", "mauvais", "problème", "probleme", "réclamation", "reclamation",
    "pas arriv", "pas reçu", "pas recu", "toujours pas", "inadmissible",
    "broken", "damaged", "leak", "expired", "missing", "late", "wrong", "complain", "never arrived",
    "mteks", "fass", "sayl", "na9es", "naqes", "t3atal", "ghalta",
)
_ORDER_TERMS = (
    "commander", "passer une commande", "passer commande", "nouvelle commande", "modifier ma commande",
    "modifier la commande", "annuler ma commande", "annuler la commande", "je voudrais", "j'aimerais",
    "je souhaite", "nous souhaitons", "planifier", "programmer une livraison", "date de livraison",
    "quand sera livr", "quand arrive", "suivi de commande", "statut de ma commande",
    "place an order", "new order", "cancel my order", "change my order", "i would like", "i'd like",
    "delivery date", "schedule a delivery", "order status", "when will",
    "nheb", "bghit", "nkhayer", "ncommandi", "wa9tach",
)
_DELIVERY_TERMS = ("livr", "deliver", "camion", "truck", "tournée", "wa9tach", "quand arrive")


def triage_locally(text: str) -> Tuple[MessageTriage, str]:
    """Keyword triage used when the LLM is unavailable. Deliberately biased
    toward "complaint": a real complaint must never be answered as a FAQ."""
    low = text.lower()
    if any(term in low for term in _COMPLAINT_TERMS):
        intent, reason = "complaint", "complaint keywords"
    elif any(term in low for term in _ORDER_TERMS):
        intent, reason = "request", "order/delivery request keywords"
    elif "?" in low or len(low.split()) <= 4:
        intent, reason = "information", "question or short message"
    else:
        intent, reason = "complaint", "default"

    delivery = any(term in low for term in _DELIVERY_TERMS)
    triage = MessageTriage(
        intent=intent,
        category="Delivery request" if delivery else "Order request" if intent == "request" else "General",
        department="logistics" if delivery else "commercial" if intent == "request" else "other",
        sentiment="neutral",
        urgency="medium",
        summary=f"Client {intent}: {text.strip()[:140]}",
    )
    return triage, reason
