"""
Django email backend that sends through Brevo's web API (HTTPS, port 443).

Why: free Render web services block the normal mail ports (25, 465, 587), so SMTP cannot be used there.
Use it by setting, in the backend's environment:

    EMAIL_BACKEND=notifications.brevo_backend.BrevoEmailBackend
    BREVO_API_KEY=<an API key from Brevo: SMTP & API > API keys>
    DEFAULT_FROM_EMAIL=<a sender address you verified in Brevo>      (a name is allowed: Finot <you@example.com>)
"""
import json
import logging
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

API_URL = "https://api.brevo.com/v3/smtp/email"
TIMEOUT_SECONDS = 20


class BrevoEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.api_key = getattr(settings, "BREVO_API_KEY", "") or ""

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            try:
                if self._send(message):
                    sent += 1
            except Exception:
                logger.exception("Brevo: could not send the email %r", message.subject)
                if not self.fail_silently:
                    raise
        return sent

    def _send(self, message):
        if not self.api_key:
            raise RuntimeError("BREVO_API_KEY is not set")
        recipients = [r for r in (message.to or []) if r]
        if not recipients:
            return False
        name, address = parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)
        payload = {
            "sender": {"email": address, "name": name or "Finot"},
            "to": [{"email": r} for r in recipients],
            "subject": message.subject,
        }
        html = next((content for content, mimetype in getattr(message, "alternatives", []) if mimetype == "text/html"), None)
        if html:
            payload["htmlContent"] = html
            payload["textContent"] = message.body or ""
        else:
            payload["textContent"] = message.body or " "
        request = urllib.request.Request(
            API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"api-key": self.api_key, "content-type": "application/json", "accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return 200 <= response.status < 300
        except urllib.error.HTTPError as exc:
            # the reason (for example an unverified sender) is in the answer body; never log the API key
            raise RuntimeError(f"Brevo answered {exc.code}: {exc.read().decode('utf-8', 'ignore')[:300]}") from exc
