"""
Automated Email Dispatcher for ECCBC Complaints.
Sends real notifications with the structured PDF report attached to department routing emails.
"""
import os
import smtplib
import pathlib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import List, Tuple, Dict, Any


def get_smtp_config() -> dict:
    return {
        "enabled": os.getenv("SMTP_ENABLED", "false").lower() in ("true", "1", "yes"),
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "noreply-eccbc@example.com")),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes"),
    }


def send_ticket_notification(
    ticket: dict,
    pdf_path: str,
    recipient_emails: List[str]
) -> Tuple[bool, str]:
    """
    Sends an automated email notification with the ticket details and PDF attachment.
    Returns (success: bool, message: str).
    """
    config = get_smtp_config()
    if not config["enabled"]:
        return False, "SMTP is disabled in configuration (SMTP_ENABLED=false)."

    if not config["user"] or not config["password"]:
        return False, "SMTP credentials missing (SMTP_USER or SMTP_PASSWORD not set)."

    # Filter valid recipients
    valid_recipients = [e.strip() for e in recipient_emails if "@" in e and not e.endswith("example-eccbc.dz")]
    if not valid_recipients:
        # If only example emails, don't crash, report gracefully
        return False, "No real external recipient emails found (placeholder @example-eccbc.dz ignored)."

    subject = f"[ECCBC Ticket #{ticket['ticket_id']}] {ticket.get('urgency', 'MEDIUM').upper()} - {ticket.get('problem_type', 'Complaint')} ({ticket.get('department_label', 'Triage')})"

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = config["from_email"]
    msg["To"] = ", ".join(valid_recipients)

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #262626; line-height: 1.5; background-color: #f8fafc; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
          <div style="background-color: #F40009; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0 0 6px 0; font-size: 20px;">Equatorial Coca-Cola Bottling Company</h2>
            <p style="margin: 0; font-size: 13px; opacity: 0.9;">Fruital Rouiba Division · Automated Complaint Dispatcher</p>
          </div>
          
          <div style="padding: 24px;">
            <div style="background: #f1f5f9; border-left: 4px solid #F40009; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
              <strong style="color: #0f172a; font-size: 16px;">Ticket #{ticket['ticket_id']}</strong>
              <div style="margin-top: 6px; font-size: 13px; color: #475569;">
                <span>Département: <b>{ticket.get('department_label')}</b></span> &bull; 
                <span>Urgence: <b style="text-transform: uppercase;">{ticket.get('urgency')}</b></span> &bull; 
                <span>Sentiment: <b>{ticket.get('sentiment')}</b></span>
              </div>
            </div>

            <h3 style="color: #F40009; font-size: 14px; text-transform: uppercase; margin-bottom: 6px;">Réclamation Client</h3>
            <p style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 14px; white-space: pre-wrap; margin-top: 0;">
              {ticket.get('complaint_text', '')}
            </p>

            <h3 style="color: #F40009; font-size: 14px; text-transform: uppercase; margin-bottom: 6px;">Résumé Analytique</h3>
            <p style="font-size: 14px; color: #334155; margin-top: 0;">{ticket.get('summary', '')}</p>

            <h3 style="color: #F40009; font-size: 14px; text-transform: uppercase; margin-bottom: 6px;">Réponse Automatique Client (Générée)</h3>
            <p style="background: #f8fafc; border-left: 3px solid #0284c7; padding: 10px 14px; font-size: 13px; color: #334155; font-style: italic; margin-top: 0;">
              {ticket.get('client_reply', '')}
            </p>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
              <p style="margin: 0;">📎 Le rapport officiel complet au format PDF est joint à cet e-mail.</p>
              <p style="margin: 4px 0 0 0;">Ce message a été généré automatiquement par l'Agent IA ECCBC (Classification Hybride + RAG).</p>
            </div>
          </div>
        </div>
      </body>
    </html>
    """
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    # Attach PDF
    pdf_file = pathlib.Path(pdf_path)
    if pdf_file.exists():
        with open(pdf_file, "rb") as f:
            pdf_attachment = MIMEApplication(f.read(), _subtype="pdf")
            pdf_attachment.add_header("Content-Disposition", "attachment", filename=f"{ticket['ticket_id']}.pdf")
            msg.attach(pdf_attachment)

    try:
        if config["port"] == 465:
            server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=15)
        else:
            server = smtplib.SMTP(config["host"], config["port"], timeout=15)
            if config["use_tls"]:
                server.starttls()

        server.login(config["user"], config["password"])
        server.sendmail(config["from_email"], valid_recipients, msg.as_string())
        server.quit()
        return True, f"Notification email successfully sent to: {', '.join(valid_recipients)}"
    except Exception as e:
        return False, f"SMTP Error: {str(e)}"


def test_smtp_connection(test_recipient: str) -> Tuple[bool, str]:
    """Tests the SMTP configuration by sending a verification email."""
    config = get_smtp_config()
    if not config["enabled"]:
        return False, "SMTP is currently disabled (SMTP_ENABLED=false)."
    if not config["user"] or not config["password"]:
        return False, "SMTP user or password not configured in .env."

    msg = MIMEText("This is a test notification from the ECCBC Complaint Assistant backend.", "plain", "utf-8")
    msg["Subject"] = "[ECCBC] SMTP Connection Test Successful"
    msg["From"] = config["from_email"]
    msg["To"] = test_recipient

    try:
        if config["port"] == 465:
            server = smtplib.SMTP_SSL(config["host"], config["port"], timeout=15)
        else:
            server = smtplib.SMTP(config["host"], config["port"], timeout=15)
            if config["use_tls"]:
                server.starttls()

        server.login(config["user"], config["password"])
        server.sendmail(config["from_email"], [test_recipient], msg.as_string())
        server.quit()
        return True, f"Test email sent successfully to {test_recipient}!"
    except Exception as e:
        return False, f"SMTP Connection Failed: {str(e)}"
