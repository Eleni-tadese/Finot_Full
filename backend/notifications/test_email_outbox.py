"""Email outbox: queue on publish, daily limit, nearest event first, skip after start, retries, reminders, cron, console."""
from datetime import datetime, time, timedelta
from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from model_bakery import baker
from rest_framework.test import APIClient

from attendance.models import AttendanceSession
from core.models import Role, UserRole
from notifications.channels.email import EmailChannel
from notifications.models import EmailConfiguration, EmailOutbox, Notification
from notifications.outbox import (
    ETHIOPIA, queue_event_announcement, queue_event_reminders, retry_failed, run_email_cron, send_outbox,
)
from service.models import Event, ServiceGroup, ServiceGroupMembership
from student.models import StudentProfile

User = get_user_model()
A = "/api/admin-console/"


def person(email):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": 2})
    return user


def event(title, hours_from_now, group=None):
    start = tz.now() + timedelta(hours=hours_from_now)
    return baker.make(Event, title=title, service_group=group, start_date=start, end_date=start + timedelta(hours=2), description="Bring a friend")


def limit(n):
    config = EmailConfiguration.get()
    config.daily_limit = n
    config.save()


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def boss():
    user = person("boss@finot.test")
    UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
    return user


@pytest.mark.django_db
class TestQueue:
    def test_publishing_queues_one_row_per_person_and_sends_within_the_allowance(self, mailoutbox):
        for i in range(4):
            person(f"p{i}@x.test")
        User.objects.create_user(username="blank", email="", password="x")  # nowhere to send
        limit(2)
        ev = event("Retreat", 48)
        EmailChannel().on_event_published(ev)
        rows = EmailOutbox.objects.filter(event=ev, kind=EmailOutbox.KIND_NEW_EVENT)
        assert rows.count() == 4
        assert rows.filter(status=EmailOutbox.SENT).count() == 2 and rows.filter(status=EmailOutbox.WAITING).count() == 2
        assert len(mailoutbox) == 2 and mailoutbox[0].subject == "New event: Retreat"
        assert "Bring a friend" in mailoutbox[0].alternatives[0][0]
        assert queue_event_announcement(ev) == 0  # publishing again never queues the same person twice

    def test_group_event_reaches_only_the_active_members(self):
        group = baker.make(ServiceGroup)
        inside, outside = person("in@x.test"), person("out@x.test")
        ServiceGroupMembership.objects.create(service_group=group, student=inside, status=ServiceGroupMembership.ACTIVE)
        ServiceGroupMembership.objects.create(service_group=group, student=outside, status=ServiceGroupMembership.INACTIVE)
        ev = event("Choir practice", 48, group=group)
        assert queue_event_announcement(ev) == 1
        assert list(EmailOutbox.objects.filter(event=ev).values_list("email", flat=True)) == ["in@x.test"]


@pytest.mark.django_db
class TestSending:
    def test_nearest_event_first_and_the_daily_limit_counts_what_was_already_sent(self, mailoutbox):
        person("p@x.test")
        far, near = event("Far", 72), event("Near", 24)
        queue_event_announcement(far)
        queue_event_announcement(near)
        limit(1)
        result = send_outbox()
        assert result["sent"] == 1 and result["left"] == 1 and result["stopped"] == ""
        assert EmailOutbox.objects.get(event=near).status == EmailOutbox.SENT
        assert send_outbox()["sent"] == 0  # today's allowance is used up
        limit(5)
        assert send_outbox()["sent"] == 1 and len(mailoutbox) == 2

    def test_rows_are_skipped_only_when_the_event_is_over(self, mailoutbox):
        person("p@x.test")
        queue_event_announcement(event("Late", 1))
        # while the event is running (it started 30 minutes ago) the announcement still goes out
        running = send_outbox(now=tz.now() + timedelta(minutes=90))
        assert running["sent"] == 1 and running["skipped"] == 0
        person("q@x.test")
        queue_event_announcement(event("Over", 1))
        over = send_outbox(now=tz.now() + timedelta(days=2))
        assert over["skipped"] >= 1 and over["sent"] == 0
        assert EmailOutbox.objects.filter(status=EmailOutbox.SKIPPED).exclude(error="").exists()

    def test_a_failure_is_retried_three_times_then_kept_with_its_error(self, mailoutbox):
        person("p@x.test")
        queue_event_announcement(event("X", 48))
        with mock.patch("notifications.channels.email._send_html_email", side_effect=RuntimeError("boom")):
            for _ in range(3):
                assert send_outbox()["failed"] == 1
        row = EmailOutbox.objects.get()
        assert row.status == EmailOutbox.FAILED and row.attempts == 3 and "boom" in row.error
        assert retry_failed() == 1
        row.refresh_from_db()
        assert row.status == EmailOutbox.WAITING and row.attempts == 0 and row.error == ""
        assert send_outbox()["sent"] == 1 and len(mailoutbox) == 1

    def test_the_run_stops_after_five_failures_in_a_row(self):
        for i in range(7):
            person(f"p{i}@x.test")
        queue_event_announcement(event("X", 48))
        with mock.patch("notifications.channels.email._send_html_email", side_effect=RuntimeError("down")):
            result = send_outbox()
        assert result["failed"] == 5 and "Stopped" in result["stopped"] and result["left"] == 7
        assert EmailOutbox.objects.filter(attempts=0).count() == 2


@pytest.mark.django_db
class TestAnswerEmails:
    def test_the_asker_is_emailed_without_the_private_text(self, mailoutbox):
        from questionanswer.models import Answer, Question

        asker = person("ask@x.test")
        q = baker.make(Question, user=asker, visibility="PRIVATE", category="Spiritual", question_body="My secret worry")
        answer = baker.make(Answer, question=q, answer_body="A very private answer", is_approved=True)
        EmailChannel().on_question_answered(answer)
        assert [m.to for m in mailoutbox] == [["ask@x.test"]]
        html = mailoutbox[0].alternatives[0][0]
        assert "Spiritual" in html and "dashboard/questions" in html
        assert "very private answer" not in html and "secret worry" not in html
        assert EmailOutbox.objects.get().kind == EmailOutbox.KIND_QA_ANSWER

    def test_public_asker_is_emailed_when_published_and_an_anonymous_one_is_not(self, mailoutbox):
        from questionanswer.models import Answer, Question

        asker = person("pub@x.test")
        q = baker.make(Question, user=asker, visibility="PUBLIC", category="Academic", is_approved=True)
        EmailChannel().on_question_answered(baker.make(Answer, question=q, is_approved=True))
        assert [m.to for m in mailoutbox] == [["pub@x.test"]] and "anonymous/questions" in mailoutbox[0].alternatives[0][0]
        anonymous = baker.make(Question, user=None, visibility="PUBLIC", category="Academic", is_approved=True)
        EmailChannel().on_question_answered(baker.make(Answer, question=anonymous, is_approved=True))
        assert len(mailoutbox) == 1  # nobody to write to


@pytest.mark.django_db
class TestReminders:
    def test_tomorrows_events_get_an_in_app_reminder_and_an_email_row_once(self):
        p = person("p@x.test")
        tomorrow = datetime.combine(tz.now().astimezone(ETHIOPIA).date() + timedelta(days=1), time(10, 0), tzinfo=ETHIOPIA)
        baker.make(Event, title="Picnic", service_group=None, start_date=tomorrow, end_date=tomorrow + timedelta(hours=2))
        baker.make(Event, title="Later", service_group=None, start_date=tomorrow + timedelta(days=3), end_date=tomorrow + timedelta(days=3, hours=1))
        assert queue_event_reminders() == {"events": 1, "queued": 1}
        assert Notification.objects.filter(user=p, notification_type=Notification.TYPE_REMINDER, title="Tomorrow: Picnic").count() == 1
        row = EmailOutbox.objects.get()
        assert row.kind == EmailOutbox.KIND_EVENT_TOMORROW and row.not_after == tomorrow + timedelta(hours=2)
        assert queue_event_reminders() == {"events": 0, "queued": 0}


@pytest.mark.django_db
class TestCron:
    URL = "/api/notifications/cron/email-outbox/"

    def test_needs_the_secret(self, settings):
        settings.CRON_SECRET = ""
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="").status_code == 404
        settings.CRON_SECRET = "right"
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="wrong").status_code == 404
        res = APIClient().post(self.URL, HTTP_X_CRON_TOKEN="right")
        assert res.status_code == 200 and set(res.json()) == {"attendance", "reminders", "email"}

    def test_the_run_closes_forgotten_attendance_sessions(self, boss):
        ev = event("Old", -5)
        session = AttendanceSession.objects.create(event=ev, opened_by=boss, auto_close_at=tz.now() - timedelta(minutes=1))
        fresh = AttendanceSession.objects.create(event=event("Now", -1), opened_by=boss, auto_close_at=tz.now() + timedelta(hours=1))
        assert run_email_cron()["attendance"]["closed"] == 1
        session.refresh_from_db()
        fresh.refresh_from_db()
        assert session.closed_at is not None and fresh.closed_at is None


@pytest.mark.django_db
class TestConsole:
    def test_settings_outbox_retry_and_overview(self, boss, mailoutbox):
        c = client_for(boss)
        assert c.get(A + "email/settings/").json()["daily_limit"] == 300
        assert c.patch(A + "email/settings/", {"daily_limit": -1}, format="json").status_code == 400
        assert c.patch(A + "email/settings/", {"daily_limit": 50}, format="json").json()["daily_limit"] == 50

        person("p@x.test")
        queue_event_announcement(event("Picnic", 48))
        EmailOutbox.objects.update(status=EmailOutbox.FAILED, error="boom")
        data = c.get(A + "email/outbox/", {"status": "FAILED"}).json()
        assert data["count"] == 2 and data["results"][0]["event"] == "Picnic" and data["results"][0]["error"] == "boom"
        assert c.get(A + "email/outbox/", {"status": "nope"}).status_code == 400
        assert c.post(A + "email/outbox/retry/").json()["retried"] == 2
        assert c.get(A + "email/outbox/", {"status": "WAITING"}).json()["count"] == 2

        # a test notice is put at the top of every email until it is cleared
        assert c.patch(A + "email/settings/", {"test_notice": "x" * 501}, format="json").status_code == 400
        assert c.patch(A + "email/settings/", {"test_notice": "  This is only a test of Finot. "}, format="json").json()["test_notice"] == "This is only a test of Finot."
        overview = c.get(A + "overview/").json()["email"]
        assert overview == {"waiting": 2, "failed": 0, "sent_today": 0, "daily_limit": 50}
        assert c.post(A + "email/outbox/send/", {"wait": True}, format="json").json()["sent"] == 2 and len(mailoutbox) == 2
        assert "only a test of Finot" in mailoutbox[0].alternatives[0][0] and "only a test of Finot" in mailoutbox[0].body
        assert c.patch(A + "email/settings/", {"test_notice": ""}, format="json").json()["test_notice"] == ""
        assert client_for(person("stu@x.test")).get(A + "email/settings/").status_code == 403


@pytest.mark.django_db
class TestWeeklySwitch:
    def test_super_admin_can_pause_and_resume_the_weekly_reminder(self, boss, mailoutbox):
        from notifications.reminders import send_weekly_reminders

        c = client_for(boss)
        person("w@x.test")
        assert c.get(A + "email/settings/").json()["weekly_reminders_on"] is True

        # pause: nothing goes out, not even a forced run, and no app message is created
        assert c.patch(A + "email/settings/", {"weekly_reminders_on": False}, format="json").json()["weekly_reminders_on"] is False
        result = send_weekly_reminders(force=True)
        assert result["status"] == "paused" and result["emails"] == 0
        assert not Notification.objects.exists() and not EmailOutbox.objects.exists()

        # resume: it goes out again
        assert c.patch(A + "email/settings/", {"weekly_reminders_on": True}, format="json").json()["weekly_reminders_on"] is True
        assert send_weekly_reminders()["status"] == "sent"
        assert EmailOutbox.objects.filter(kind=EmailOutbox.KIND_WEEKLY_DONATION).exists()

    def test_the_switch_only_accepts_true_or_false_and_only_the_super_admin(self, boss):
        c = client_for(boss)
        assert c.patch(A + "email/settings/", {"weekly_reminders_on": "no"}, format="json").status_code == 400
        assert client_for(person("s@x.test")).patch(A + "email/settings/", {"weekly_reminders_on": False}, format="json").status_code == 403
