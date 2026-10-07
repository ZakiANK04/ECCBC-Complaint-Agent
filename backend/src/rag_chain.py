"""
Step 3: retrieve relevant knowledge-base context for a complaint, then
generate an empathetic, grounded reply to the client — grounded meaning
the model is told explicitly to only state policies/measures that appear
in the retrieved context, to reduce hallucination.
"""
from google import genai
from google.genai import types

REPLY_SYSTEM_INSTRUCTION = """You are ECCBC's customer-support assistant.
Write a short, warm, professional reply (4-6 sentences) to a client who
just submitted a complaint. Reply in the same language the client used.
Rules:
- Acknowledge the specific issue they described.
- Only mention concrete policies, timelines, or interim measures if they
  appear in the "Reference context" below. If the context does not cover
  the situation, give a general reassurance and say a team member will
  follow up, without inventing specifics.
- Do not promise refunds, compensation amounts, or exact dates unless the
  context explicitly supports it.
- Close by confirming the case has been logged and routed to the right team.
"""


def retrieve_context(collection, query: str, k: int = 4) -> list[str]:
    if collection.count() == 0:
        return []
    results = collection.query(query_texts=[query], n_results=min(k, collection.count()))
    return results["documents"][0] if results["documents"] else []


def generate_client_reply(
    client: genai.Client,
    complaint_text: str,
    context_chunks: list[str],
    model: str = "gemini-3-flash-preview",
) -> str:
    context_block = "\n\n---\n\n".join(context_chunks) if context_chunks else "(no matching reference material found)"
    prompt = (
        f"Client complaint:\n\"\"\"\n{complaint_text}\n\"\"\"\n\n"
        f"Reference context:\n\"\"\"\n{context_block}\n\"\"\""
    )
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=REPLY_SYSTEM_INSTRUCTION,
            temperature=0.4,
        ),
    )
    return response.text


def generate_local_client_reply(complaint_text: str) -> str:
    """A concise, multilingual-safe response for offline prototype use."""
    text = complaint_text.lower()
    if any(marker in text for marker in ("bonjour", "livraison", "facture", "bouteille", "j'ai", "nous")):
        return (
            "Merci de nous avoir signalé ce problème. Votre réclamation a bien été "
            "enregistrée et transmise à l'équipe concernée pour vérification. "
            "Un membre de notre équipe vous recontactera dès que possible."
        )
    return (
        "Thank you for reporting this issue. Your complaint has been logged and routed "
        "to the appropriate team for review. A team member will follow up as soon as possible."
    )
