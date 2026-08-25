"""
TaxEaseBD - Signup verification emails
------------------------------------------
Sends the 6-digit signup code over Gmail's SMTP relay using smtplib from
Python's standard library - no third-party email SDK needed, matching the
"keep dependencies small" approach the rest of the backend follows (see
requirements.txt).

Setup: in Google Account -> Security -> 2-Step Verification -> App
Passwords, create an app password for "Mail" and put your Gmail address
and that 16-character app password in backend/.env as GMAIL_ADDRESS /
GMAIL_APP_PASSWORD. Never use your real Gmail login password here - it
won't work with 2FA enabled, and shouldn't be pasted into a .env file
even if it did.

Without those two variables set, is_configured() is False and the code
is never emailed - main.py falls back to printing it to the backend
console instead, so signup still works end-to-end in local dev without
setting up a Gmail account first.
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.utils import formataddr

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")


def is_configured() -> bool:
    return bool(GMAIL_ADDRESS and GMAIL_APP_PASSWORD)


def send_verification_email(to_email: str, code: str, name: str = None) -> None:
    """Raises on failure - callers decide how to degrade (main.py falls
    back to a console-printed code instead of failing signup outright)."""
    if not is_configured():
        raise RuntimeError("Email is not configured (set GMAIL_ADDRESS / GMAIL_APP_PASSWORD in backend/.env)")

    greeting = f"Hi {name}," if name else "Hi,"
    body = (
        f"{greeting}\n\n"
        f"Your TaxEaseBD verification code is: {code}\n\n"
        f"This code expires in {os.getenv('OTP_TTL_MINUTES', '10')} minutes. "
        "If you didn't request this, you can safely ignore this email.\n\n"
        "— TaxEaseBD"
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"{code} is your TaxEaseBD verification code"
    msg["From"] = formataddr(("TaxEaseBD", GMAIL_ADDRESS))
    msg["To"] = to_email

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=10) as server:
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_ADDRESS, [to_email], msg.as_string())
