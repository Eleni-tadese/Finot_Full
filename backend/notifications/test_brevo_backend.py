import json
from unittest import mock

import pytest
from django.core.mail import EmailMultiAlternatives, get_connection, send_mail

from notifications.brevo_backend import BrevoEmailBackend


class FakeResponse:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def backend(settings, key="test-key"):
    settings.BREVO_API_KEY = key
    settings.DEFAULT_FROM_EMAIL = "Finot <sender@example.org>"
    return get_connection("notifications.brevo_backend.BrevoEmailBackend")


def test_sends_html_and_text_through_the_api(settings):
    conn = backend(settings)
    with mock.patch("urllib.request.urlopen", return_value=FakeResponse()) as urlopen:
        sent = send_mail("Hello", "plain", None, ["a@example.com"], html_message="<p>hi</p>", connection=conn)
    assert sent == 1
    request = urlopen.call_args[0][0]
    assert request.full_url == "https://api.brevo.com/v3/smtp/email"
    assert request.headers["Api-key"] == "test-key"
    body = json.loads(request.data)
    assert body["sender"] == {"email": "sender@example.org", "name": "Finot"}
    assert body["to"] == [{"email": "a@example.com"}] and body["subject"] == "Hello"
    assert body["htmlContent"] == "<p>hi</p>" and body["textContent"] == "plain"


def test_text_only_message(settings):
    conn = backend(settings)
    with mock.patch("urllib.request.urlopen", return_value=FakeResponse()) as urlopen:
        EmailMultiAlternatives("S", "only text", "x@example.org", ["b@example.com"], connection=conn).send()
    body = json.loads(urlopen.call_args[0][0].data)
    assert "htmlContent" not in body and body["textContent"] == "only text"


def test_missing_key_fails_loudly_unless_silent(settings):
    conn = backend(settings, key="")
    with pytest.raises(RuntimeError):
        send_mail("S", "b", None, ["a@example.com"], connection=conn)
    assert send_mail("S", "b", None, ["a@example.com"], connection=BrevoEmailBackend(fail_silently=True)) == 0


def test_the_account_code_email_path_reports_failure_cleanly(settings):
    """When mail cannot be sent the student gets the plain 'could not be sent' answer, not a crash."""
    from notifications.channels.email import _send_html_email
    settings.EMAIL_BACKEND = "notifications.brevo_backend.BrevoEmailBackend"
    settings.BREVO_API_KEY = ""
    assert _send_html_email("S", ["a@example.com"], message_body="<p>x</p>") is False
