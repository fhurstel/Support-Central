"""Email service for client communications."""
import os
from typing import Optional

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "support@fijiitsolutions.com")


async def send_email_to_client(to_email: str, subject: str, body: str, html: str = None, ticket=None):
    """Send an email to a client."""
    import aiosmtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    msg = MIMEMultipart("alternative")
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))
    if html:
        msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASS,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


async def send_ticket_summary_email(ticket):
    """Send ticket closure summary + satisfaction survey to client."""
    if not ticket.client or not ticket.client.email:
        return False

    subject = f"Ticket #{ticket.ticket_number} Resolved — How Did We Do?"
    body = f"""Hi {ticket.client.name},

Your support ticket has been resolved.

Ticket: #{ticket.ticket_number}
Title: {ticket.title}
Total time: {ticket.total_time_hours} hours

Please let us know how satisfied you were with our service:
😊 Happy  —  😐 Moderate  —  😞 Unhappy

Reply to this email with your rating, or call us anytime.

— Fiji IT Solutions
"""
    return await send_email_to_client(
        to_email=ticket.client.email,
        subject=subject,
        body=body,
        ticket=ticket,
    )


async def send_invoice_email(invoice):
    """Send invoice email to client."""
    if not invoice.client or not invoice.client.email:
        return False

    subject = f"Invoice #{invoice.invoice_number} — Fiji IT Solutions"
    body = f"""{invoice.client.name},

Please find your invoice below:

Invoice: #{invoice.invoice_number}
Total Hours: {invoice.total_hours}
Rate: ${invoice.hourly_rate}/hr
Total Amount: ${invoice.total_amount:.2f}

Details:
{invoice.notes}

Thank you for your business!

— Fiji IT Solutions
"""
    return await send_email_to_client(
        to_email=invoice.client.email,
        subject=subject,
        body=body,
    )
