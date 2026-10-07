"""Weekly donation reminder, shared by the management command and the scheduled HTTP trigger."""
import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone

from student.models import StudentProfile
from notifications.models import Notification, FCMDeviceToken
from notifications.channels.push import _send_fcm_multicast, _initialize_firebase

User = get_user_model()
logger = logging.getLogger(__name__)

TITLE = "Weekly Donation Reminder"
def amount():
    from django.conf import settings

    return getattr(settings, "WEEKLY_DONATION_AMOUNT", 10)


def message():
    return f"Happy Thursday! Please remember to send your weekly fellowship donation of {amount()} birr today."


MESSAGE = message()  # kept for older callers; the live text is built by message()
BATCH_SIZE = 250


def already_sent_this_week():
    """True when a reminder was created in the last 6 days (protects against double runs)."""
    since = timezone.now() - timedelta(days=6)
    return Notification.objects.filter(
        notification_type=Notification.TYPE_REMINDER, title=TITLE, created_at__gte=since
    ).exists()


def _process_batch(users):
    Notification.objects.bulk_create(
        [
            Notification(user=u, title=TITLE, message=message(), notification_type=Notification.TYPE_REMINDER)
            for u in users
        ]
    )
    tokens = list(
        FCMDeviceToken.objects.filter(user__in=users).values_list("device_token", flat=True)
    )
    if tokens:
        _send_fcm_multicast(
            title=TITLE, body=message(), notification_type=Notification.TYPE_REMINDER, device_tokens=tokens
        )

    from notifications.models import SMSLog
    from notifications.sms import send_sms_bulk

    send_sms_bulk(users, message(), SMSLog.TRIGGER_DONATION_REMINDER)
    return len(users), len(tokens)


# Addresses that can never receive mail (reserved for tests and documentation). Sending to them only produces
# bounces, which waste the daily allowance and make the mail provider distrust the account.
UNDELIVERABLE_SUFFIXES = (".test", ".example", ".invalid", ".localhost", ".finot")
UNDELIVERABLE_DOMAINS = {"example.com", "example.org", "example.net"}


def is_deliverable(email):
    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    return "@" in (email or "") and "." in domain and not domain.endswith(UNDELIVERABLE_SUFFIXES) and domain not in UNDELIVERABLE_DOMAINS


def send_reminder_emails(recipients):
    """
    Email the reminder to (email, first_name) pairs, over ONE mail connection.
    Never raises: a mail problem must not stop the in-app reminder. Returns how many were sent.
    """
    from django.core.mail import get_connection
    from django.conf import settings

    from notifications.channels.email import _send_html_email

    if not recipients:
        return 0
    link = f"{getattr(settings, 'FRONTEND_URL', '')}/dashboard/donations/give"
    sent = 0
    try:
        connection = get_connection()
        connection.open()
        try:
            for email, first_name in recipients:
                body = (
                    f'<p style="font-size: 16px;">Dear <strong>{first_name or "friend"}</strong>,</p>'
                    f"<p>Happy Thursday! Please remember to send your weekly fellowship donation of "
                    f"<strong>{amount()} birr</strong> today.</p>"
                    f'<p style="margin: 24px 0;"><a href="{link}" style="background-color: #fbbf24; color: #1e3a8a; '
                    f'padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">Give now</a></p>'
                    f"<p>May God bless you!</p>"
                )
                if _send_html_email("Weekly donation reminder", [email], message_body=body, connection=connection):
                    sent += 1
        finally:
            connection.close()
    except Exception:
        logger.exception("Weekly reminder emails stopped early after %s", sent)
    return sent


def send_weekly_reminders(force=False, background_email=False):
    """
    Returns {"status": "sent"|"skipped"|"no_users", "users": n, "devices": n, "emails": n, "emails_skipped": n, "reason": str}.

    The in-app notification, the phone push and (if switched on) the SMS go out at once. The emails (limited to
    WEEKLY_REMINDER_EMAIL_LIMIT per run) are sent right away, or, with background_email=True (the web trigger),
    in a background thread so the request returns quickly; then "emails" is the number queued.
    """
    if not force and already_sent_this_week():
        return {"status": "skipped", "users": 0, "devices": 0, "emails": 0, "emails_skipped": 0, "reason": "already sent in the last 6 days"}

    active = User.objects.filter(
        is_active=True, student_profile__status__in=[StudentProfile.IN_CAMPUS, StudentProfile.GRADUATED]
    ).order_by("id")
    if not active.exists():
        return {"status": "no_users", "users": 0, "devices": 0, "emails": 0, "emails_skipped": 0, "reason": "no active students or graduates"}

    _initialize_firebase()
    total_users = total_tokens = 0
    batch = []
    recipients = []
    for user in active.iterator(chunk_size=BATCH_SIZE):
        batch.append(user)
        if user.email:
            recipients.append((user.email, user.first_name))
        if len(batch) == BATCH_SIZE:
            u, t = _process_batch(batch)
            total_users += u
            total_tokens += t
            batch = []
    if batch:
        u, t = _process_batch(batch)
        total_users += u
        total_tokens += t

    from django.conf import settings

    if getattr(settings, "REMINDER_EMAIL_SKIP_UNDELIVERABLE", True):
        recipients = [r for r in recipients if is_deliverable(r[0])]

    limit = getattr(settings, "WEEKLY_REMINDER_EMAIL_LIMIT", 300)
    skipped = max(len(recipients) - limit, 0)
    if skipped:
        logger.warning("Weekly reminder: %s emails not sent (limit %s per run).", skipped, limit)
    recipients = recipients[:limit]

    if background_email and recipients:
        import threading

        threading.Thread(target=send_reminder_emails, args=(recipients,), daemon=True).start()
        emails = len(recipients)
    else:
        emails = send_reminder_emails(recipients)
    return {"status": "sent", "users": total_users, "devices": total_tokens, "emails": emails, "emails_skipped": skipped, "reason": ""}
