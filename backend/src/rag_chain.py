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


REQUEST_REPLY_SYSTEM_INSTRUCTION = """You are ECCBC's customer-support assistant.
A client sent a request (for example about an order or a delivery) that a
staff member has to handle. Write a short, warm, professional reply
(3-4 sentences) in the same language the client used.
Rules:
- Restate what they asked for so they know it was understood.
- Say the request has been recorded and forwarded to the team in charge,
  who will get back to them.
- Do not confirm the order, a price, a quantity, availability or a date:
  only a staff member can. Only state facts found in the "Reference
  context" below.
"""

INFO_REPLY_SYSTEM_INSTRUCTION = """You are ECCBC's customer-support assistant
for clients of the Fruital Rouiba bottling division. Answer the client's
question in the same language they used, in 2-6 sentences.
Rules:
- Base factual statements only on the "Reference context" below. Never
  invent prices, dates, stock levels, phone numbers or policies.
- If the context does not contain the answer, say plainly that you do not
  have that information, and tell them they can describe what they need
  so it is forwarded to the team.
- If the message is a greeting or thanks, respond politely and briefly
  explain that you can answer questions, record order or delivery
  requests, and log complaints.
"""


def _generate(client: genai.Client, system_instruction: str, label: str, text: str,
              context_chunks: list[str], model: str) -> str:
    context_block = "\n\n---\n\n".join(context_chunks) if context_chunks else "(no matching reference material found)"
    response = client.models.generate_content(
        model=model,
        contents=f"{label}:\n\"\"\"\n{text}\n\"\"\"\n\nReference context:\n\"\"\"\n{context_block}\n\"\"\"",
        config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.4),
    )
    return response.text


def generate_request_reply(client: genai.Client, text: str, context_chunks: list[str],
                           model: str = "gemini-3-flash-preview") -> str:
    return _generate(client, REQUEST_REPLY_SYSTEM_INSTRUCTION, "Client request", text, context_chunks, model)


def generate_info_reply(client: genai.Client, text: str, context_chunks: list[str],
                        model: str = "gemini-3-flash-preview") -> str:
    return _generate(client, INFO_REPLY_SYSTEM_INSTRUCTION, "Client question", text, context_chunks, model)


_FRENCH_MARKERS = ("bonjour", "bonsoir", "salut", "merci", "livraison", "commande", "facture", "bouteille",
                   "j'ai", "je ", "nous", "est-ce", "quel", "comment", "pourquoi", "avez")


_ENGLISH_MARKERS = (" the ", " and ", " is ", " was ", " were ", " my ", " our ", " we ", " you ", " please",
                    "hello", "thank", "delivery", "order", "received", "broken", "invoice", "would like", "when ")


def _looks_french(text: str) -> bool:
    """Language of the canned reply. Clients here write French or Darija far
    more than English, so French is the default and English must be evident."""
    low = f" {text.lower()} "
    if any(marker in low for marker in _FRENCH_MARKERS):
        return True
    return sum(marker in low for marker in _ENGLISH_MARKERS) < 2


def generate_local_request_reply(text: str) -> str:
    if _looks_french(text):
        return (
            "Votre demande a bien été enregistrée et transmise à l'équipe concernée. "
            "Un membre de notre équipe vous recontactera pour la confirmer et en assurer le suivi."
        )
    return (
        "Your request has been recorded and forwarded to the team in charge. "
        "A team member will get back to you to confirm it and follow up."
    )


def generate_local_info_reply(text: str) -> str:
    """Without the language model no answer can be written from the
    documents, so say so instead of guessing."""
    if _looks_french(text):
        return (
            "Je ne peux pas répondre automatiquement à cette question pour le moment. "
            "Décrivez votre besoin (commande, livraison ou réclamation) et je le transmettrai à l'équipe concernée."
        )
    return (
        "I cannot answer this question automatically right now. "
        "Describe what you need (order, delivery or complaint) and I will forward it to the team in charge."
    )


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
    if _looks_french(complaint_text):
        return (
            "Merci de nous avoir signalé ce problème. Votre réclamation a bien été "
            "enregistrée et transmise à l'équipe concernée pour vérification. "
            "Un membre de notre équipe vous recontactera dès que possible."
        )
    return (
        "Thank you for reporting this issue. Your complaint has been logged and routed "
        "to the appropriate team for review. A team member will follow up as soon as possible."
    )
