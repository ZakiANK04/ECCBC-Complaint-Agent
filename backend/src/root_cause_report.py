"""
Turns a RootCauseReport into a branded PDF an employee can hand to
production/quality/commercial for a decision-making meeting.
"""
import pathlib
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage

from src.root_cause import RootCauseReport

COKE_RED = colors.HexColor("#F40009")
DARK = colors.HexColor("#262626")
GRAY = colors.HexColor("#6B6B6B")
LOGO_PATH = pathlib.Path(__file__).resolve().parent.parent / "assets" / "ECCBC.png"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="RCTitle", fontSize=18, textColor=colors.white, leading=22))
styles.add(ParagraphStyle(name="RCSub", fontSize=10, textColor=colors.white, leading=14))
styles.add(ParagraphStyle(name="RCLabel", fontSize=12, textColor=COKE_RED, spaceBefore=14, spaceAfter=4, leading=14))
styles.add(ParagraphStyle(name="RCBody", fontSize=10.5, textColor=DARK, leading=15))
styles.add(ParagraphStyle(name="RCMeta", fontSize=9, textColor=GRAY, leading=13, leftIndent=8))


def generate_root_cause_pdf(report: RootCauseReport, generated_at: str, output_path: str) -> str:
    pathlib.Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=1.2 * cm, bottomMargin=1.2 * cm)
    story = []

    text_cells = [
        Paragraph("ROOT CAUSE ANALYSIS REPORT", styles["RCTitle"]),
        Paragraph(f"Generated {generated_at} · {len(report.findings)} pattern(s) identified", styles["RCSub"]),
    ]

    if LOGO_PATH.exists():
        logo_img = RLImage(str(LOGO_PATH), width=2.0 * cm, height=2.0 * cm)
        header = Table(
            [[logo_img, text_cells]],
            colWidths=[2.4 * cm, 14.6 * cm],
        )
    else:
        header = Table(
            [[text_cells]],
            colWidths=[17 * cm],
        )

    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COKE_RED),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 14))

    story.append(Paragraph("EXECUTIVE SUMMARY", styles["RCLabel"]))
    story.append(Paragraph(report.overall_summary, styles["RCBody"]))

    for i, finding in enumerate(report.findings, 1):
        story.append(
            Paragraph(f"PATTERN {i} — {finding.cluster_label} ({finding.ticket_count} complaints)", styles["RCLabel"])
        )
        story.append(Paragraph(f"<b>Likely root cause:</b> {finding.likely_root_cause}", styles["RCBody"]))
        story.append(Paragraph("Supporting evidence:", styles["RCBody"]))
        for ev in finding.supporting_evidence:
            story.append(Paragraph(f"• {ev}", styles["RCMeta"]))
        story.append(Paragraph(f"<b>Recommended action:</b> {finding.recommended_action}", styles["RCBody"]))

    if not report.findings:
        story.append(Spacer(1, 6))
        story.append(Paragraph(
            "No repeating pattern met the minimum-count threshold yet — "
            "rerun this report once more tickets have accumulated.",
            styles["RCMeta"],
        ))

    doc.build(story)
    return output_path
