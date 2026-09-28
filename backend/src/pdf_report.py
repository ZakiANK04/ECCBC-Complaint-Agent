"""
Step 4: turn a classified complaint into a clean, structured PDF ticket
that an employee can open, forward, or file — instead of a raw chat log.
"""
import html
import pathlib
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage

COKE_RED = colors.HexColor("#F40009")
DARK = colors.HexColor("#262626")
GRAY = colors.HexColor("#6B6B6B")
LOGO_PATH = pathlib.Path(__file__).resolve().parent.parent / "assets" / "ECCBC.png"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TicketTitle", fontSize=18, textColor=colors.white, spaceAfter=4, leading=22))
styles.add(ParagraphStyle(name="TicketSub", fontSize=10, textColor=colors.white, leading=14))
styles.add(ParagraphStyle(name="Label", fontSize=10, textColor=COKE_RED, spaceBefore=10, spaceAfter=2, leading=12))
styles.add(ParagraphStyle(name="Body", fontSize=10.5, textColor=DARK, leading=15))
styles.add(ParagraphStyle(name="Meta", fontSize=9, textColor=GRAY, leading=12))


def generate_ticket_pdf(ticket: dict, output_path: str) -> str:
    """
    ticket must contain: ticket_id, created_at, complaint_text,
    problem_type, department, department_label, sentiment, urgency,
    summary, client_reply, context_used (list[str])
    """
    pathlib.Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    story = []

    text_cells = [
        Paragraph(f"COMPLAINT TICKET #{ticket['ticket_id']}", styles["TicketTitle"]),
        Paragraph(f"Submitted {ticket['created_at']}  ·  Routed to: {ticket['department_label']}", styles["TicketSub"]),
    ]

    if LOGO_PATH.exists():
        logo_img = RLImage(str(LOGO_PATH), width=2.0 * cm, height=2.0 * cm)
        header_table = Table(
            [[logo_img, text_cells]],
            colWidths=[2.4 * cm, 14.6 * cm],
        )
    else:
        header_table = Table(
            [[text_cells]],
            colWidths=[17 * cm],
        )

    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COKE_RED),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 14))

    fields = [
        ("Problem type", ticket["problem_type"]),
        ("Sentiment", ticket["sentiment"].capitalize()),
        ("Urgency", ticket["urgency"].capitalize()),
        ("Summary", ticket["summary"]),
    ]
    for label, value in fields:
        story.append(Paragraph(label.upper(), styles["Label"]))
        story.append(Paragraph(value, styles["Body"]))

    story.append(Paragraph("ORIGINAL COMPLAINT", styles["Label"]))
    clean_complaint = html.escape(ticket["complaint_text"]).replace("\n", "<br/>")
    story.append(Paragraph(clean_complaint, styles["Body"]))

    story.append(Paragraph("AUTOMATED CLIENT-FACING REPLY", styles["Label"]))
    clean_reply = html.escape(ticket["client_reply"]).replace("\n", "<br/>")
    story.append(Paragraph(clean_reply, styles["Body"]))

    if ticket.get("context_used"):
        story.append(Paragraph("REFERENCE CONTEXT USED (RAG)", styles["Label"]))
        for i, chunk in enumerate(ticket["context_used"], 1):
            clean_chunk = html.escape(chunk)
            story.append(Paragraph(f"[{i}] {clean_chunk}", styles["Meta"]))

    doc.build(story)
    return output_path
