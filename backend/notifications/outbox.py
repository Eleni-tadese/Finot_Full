"""
Email outbox: bulk emails (new event, event tomorrow, weekly donation reminder) are written here first and sent in
daily portions.

Why: Brevo's free plan allows about 300 mails a day and a general event can reach 1000 people. Rows wait in the
queue, the nearest event goes first, and a row whose event has already started is skipped instead of sent.

  queue_emails(kind, subject, users, body_for, not_after)   the general entry: one row per person who can get mail
  queue_event_announcement(event)   one row per person the event is for (called when an event is published)
  queue_event_reminders()           "event tomorrow": in-app reminder now + one email row, once per event
  send_outbox()                     sends waiting rows up to the daily limit, over one SMTP connection
  retry_failed()                    puts the failed rows back in the queue
  run_email_cron()                  the 6-hourly job: close forgotten attendance sessions, queue reminders, send
"""
import logging
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.db.models import Count, F
from django.utils import timezone
from django.utils.html import escape

from .models import EmailConfiguration, EmailOutbox, Notification

logger = logging.getLogger(__name__)

ETHIOPIA = dt_timezone(timedelta(hours=3))
MAX_ATTEMPTS = 3
STOP_AFTER_FAILURES_IN_A_ROW = 5  # the mail provider is probably down: keep the rest for the next run
CLAIM_MINUTES = 15  # a row claimed longer ago than this belongs to a run that died (server restart)


def today_in_ethiopia():
    return datetime.now(ETHIOPIA).date()


def _people(users):
    """(user, email) pairs that can receive mail."""
    from .reminders import is_deliverable

    skip = getattr(settings, "REMINDER_EMAIL_SKIP_UNDELIVERABLE", True)
    out = []
    for user in users:
        email = (user.email or "").strip()
        if email and (not skip or is_deliverable(email)):
            out.append((user, email))
    return out


def _event_box(event):
    """The yellow box with title, when, where, details and the button; the same for every recipient."""
    from service.event_rules import format_when

    where = ""
    if event.place_name or event.place_url:
        label = escape(event.place_name or "Open the map")
        url = (event.place_url or "").strip()
        where = f"<p><strong>Where:</strong> {label}"
        if url.startswith(("http://", "https://")):
            where += f' (<a href="{escape(url)}">map</a>)'
        where += "</p>"
    details = escape(event.description or "").replace("\n", "<br>")
    link = f"{getattr(settings, 'FRONTEND_URL', '')}/dashboard/events"
    return (
        f'<div style="background-color: #f8fafc; border-left: 4px solid #fbbf24; padding: 15px; margin: 18px 0; border-radius: 4px;">'
        f'<h3 style="margin: 0 0 8px 0; color: #1e3a8a;">{escape(event.title)}</h3>'
        f"<p><strong>When:</strong> {escape(format_when(event))}</p>"
        f"{where}"
        f'<p style="margin-bottom: 0;">{details}</p>'
        f"</div>"
        f'<p style="margin: 24px 0;"><a href="{escape(link)}" style="background-color: #fbbf24; color: #1e3a8a; '
        f'padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">See it on Finot</a></p>'
    )


def queue_emails(kind, subject, users, body_for, not_after=None, event=None):
    """One waiting row per person who can receive mail; body_for(user) builds the HTML. Returns how many rows were added."""
    rows = [
        EmailOutbox(user=user, email=email, kind=kind, event=event, subject=subject, not_after=not_after, body=body_for(user))
        for user, email in _people(users)
    ]
    EmailOutbox.objects.bulk_create(rows, batch_size=500)
    return len(rows)


def _queue(event, kind, subject, intro, users):
    """Event rows: one per person, never twice for the same event and kind."""
    already = set(EmailOutbox.objects.filter(event=event, kind=kind).values_list("user_id", flat=True))
    box = _event_box(event)
    return queue_emails(
        kind, subject, [user for user in users if user.id not in already],
        lambda user: f'<p style="font-size: 16px;">Dear <strong>{escape(user.first_name or "friend")}</strong>,</p><p>{intro}</p>{box}',
        # skipped only once the event is OVER (not when it starts): an announcement still goes out while it is running
        not_after=event.end_date, event=event,
    )


def queue_event_announcement(event):
    """Rows for everyone the event is for: all active users, or only the group's active members."""
    from service.event_rules import notification_audience

    group = escape(event.service_group.name) if event.service_group_id else ""
    intro = f"A new program was announced for the <strong>{group}</strong> group:" if group else "A new program was announced:"
    return _queue(event, EmailOutbox.KIND_NEW_EVENT, f"New event: {event.title}", intro, notification_audience(event))


def queue_event_reminders(today=None):
    """Events that start tomorrow (Ethiopia date): an in-app reminder now and an email row, once per event."""
    from service.event_rules import format_when, notification_audience
    from service.models import Event

    today = today or today_in_ethiopia()
    start = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=ETHIOPIA)
    events = Event.objects.filter(start_date__gte=start, start_date__lt=start + timedelta(days=1), reminder_sent_at__isnull=True)
    done = queued = 0
    for event in events:
        users = list(notification_audience(event))
        title = f"Tomorrow: {event.title}"
        Notification.objects.bulk_create([
            Notification(
                user=user, title=title, notification_type=Notification.TYPE_REMINDER,
                message=f"{event.title} is tomorrow, {format_when(event)}. See you there!",
            )
            for user in users
        ])
        queued += _queue(event, EmailOutbox.KIND_EVENT_TOMORROW, title, "A reminder: this program is <strong>tomorrow</strong>.", users)
        event.reminder_sent_at = timezone.now()
        event.save(update_fields=["reminder_sent_at"])
        done += 1
    return {"events": done, "queued": queued}


def _start_of_today_utc():
    return timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)  # Brevo counts its daily allowance in UTC


def sent_today():
    return EmailOutbox.objects.filter(status=EmailOutbox.SENT, sent_at__gte=_start_of_today_utc()).count()


def counts():
    """What the Super Admin sees: the limit and how many rows are in each state."""
    by_status = {key: 0 for key, _ in EmailOutbox.STATUS_CHOICES}
    for row in EmailOutbox.objects.values("status").annotate(n=Count("id")):
        by_status[row["status"]] = row["n"]
    config = EmailConfiguration.get()
    limit = config.daily_limit
    today = sent_today()
    return {
        "daily_limit": limit, "sent_today": today, "remaining_today": max(limit - today, 0),
        "test_notice": config.test_notice, "weekly_reminders_on": config.weekly_reminders_on,
        "waiting": by_status[EmailOutbox.WAITING] + by_status[EmailOutbox.SENDING],
        "sent": by_status[EmailOutbox.SENT], "failed": by_status[EmailOutbox.FAILED], "skipped": by_status[EmailOutbox.SKIPPED],
    }


def send_outbox(now=None):
    """
    Send waiting rows, nearest event first, up to today's remaining allowance.
    Returns {"sent", "skipped", "failed", "left", "stopped"}; "stopped" is a reason when the run gave up early.
    """
    from django.core.mail import get_connection

    from .channels.email import _send_html_email

    now = now or timezone.now()
    EmailOutbox.objects.filter(status=EmailOutbox.SENDING, claimed_at__lt=now - timedelta(minutes=CLAIM_MINUTES)).update(
        status=EmailOutbox.WAITING
    )
    skipped = EmailOutbox.objects.filter(status=EmailOutbox.WAITING, not_after__lte=now).update(
        status=EmailOutbox.SKIPPED, error="The event was already over."
    )
    result = {"sent": 0, "skipped": skipped, "failed": 0, "left": 0, "stopped": ""}
    allowance = max(EmailConfiguration.get().daily_limit - sent_today(), 0)
    ids = list(
        EmailOutbox.objects.filter(status=EmailOutbox.WAITING)
        .order_by(F("not_after").asc(nulls_last=True), "created_at", "id")
        .values_list("id", flat=True)[:allowance]
    )
    if not ids:
        result["left"] = EmailOutbox.objects.filter(status=EmailOutbox.WAITING).count()
        return result
    try:
        connection = get_connection()
        connection.open()
    except Exception as exc:
        logger.exception("Email outbox: could not open the mail connection")
        result["stopped"] = f"Could not connect to the mail server: {exc}"[:500]
        result["left"] = EmailOutbox.objects.filter(status=EmailOutbox.WAITING).count()
        return result

    failures_in_a_row = 0
    try:
        for pk in ids:
            # claim the row first, so two runs at the same time never send the same email twice
            if EmailOutbox.objects.filter(pk=pk, status=EmailOutbox.WAITING).update(status=EmailOutbox.SENDING, claimed_at=now) != 1:
                continue
            row = EmailOutbox.objects.get(pk=pk)
            try:
                _send_html_email(row.subject, [row.email], message_body=row.body, connection=connection, raise_errors=True)
            except Exception as exc:
                attempts = row.attempts + 1
                EmailOutbox.objects.filter(pk=pk).update(
                    status=EmailOutbox.FAILED if attempts >= MAX_ATTEMPTS else EmailOutbox.WAITING,
                    attempts=attempts, error=str(exc)[:500] or exc.__class__.__name__,
                )
                result["failed"] += 1
                failures_in_a_row += 1
                if failures_in_a_row >= STOP_AFTER_FAILURES_IN_A_ROW:
                    result["stopped"] = f"Stopped after {failures_in_a_row} failures in a row; the rest waits for the next run."
                    break
                continue
            EmailOutbox.objects.filter(pk=pk).update(status=EmailOutbox.SENT, sent_at=timezone.now(), error="")
            result["sent"] += 1
            failures_in_a_row = 0
    finally:
        try:
            connection.close()
        except Exception:
            pass
    result["left"] = EmailOutbox.objects.filter(status=EmailOutbox.WAITING).count()
    logger.info("Email outbox: %s", result)
    return result


def send_outbox_soon():
    """Send in a background thread so a web request does not wait for the mail server (synchronous in tests)."""
    if getattr(settings, "OUTBOX_SEND_SYNC", False):
        return send_outbox()
    import threading

    from django.db import close_old_connections

    def _run():
        try:
            send_outbox()
        finally:
            close_old_connections()

    threading.Thread(target=_run, daemon=True).start()
    return None


def retry_failed():
    """Failed rows go back to the queue with a fresh count. Returns how many."""
    return EmailOutbox.objects.filter(status=EmailOutbox.FAILED).update(status=EmailOutbox.WAITING, attempts=0, error="")


def run_email_cron():
    """The 6-hourly job (see .github/workflows/email-outbox.yml)."""
    from attendance.rules import close_stale_sessions

    closed, absent = close_stale_sessions()
    return {"attendance": {"closed": closed, "absent": absent}, "reminders": queue_event_reminders(), "email": send_outbox()}
