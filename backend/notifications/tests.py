import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from model_bakery import baker
from rest_framework.test import APIClient

from notifications.channels.sms import SMSChannel
from notifications.models import Notification, SMSConfiguration, SMSLog
from notifications.sms import MAX_LENGTH, send_sms, send_sms_bulk
from notifications.sms.phone import normalize_phone
from notifications.sms.providers import ConsoleProvider, get_provider
from questionanswer.models import Answer, Question
from service.models import Event
from student.models import StudentProfile

User = get_user_model()


class TestPhone:
    @pytest.mark.parametrize("raw,expected", [
        ("0911223344", "+251911223344"), ("911223344", "+251911223344"),
        ("+251 91 122 33 44", "+251911223344"), ("00251911223344", "+251911223344"),
        ("251911223344", "+251911223344"), ("0711223344", "+251711223344"),
        ("+14155552671", "+14155552671"),
    ])
    def test_valid(self, raw, expected):
        assert normalize_phone(raw) == expected

    @pytest.mark.parametrize("raw", [None, "", "abc", "0111223344", "12345", "+251111223344", "09112233"])
    def test_invalid(self, raw):
        assert normalize_phone(raw) is None


def make_student(n, phone="0911223344", opt_in=True):
    user = User.objects.create_user(username=f"s{n}@finot.test", email=f"s{n}@finot.test", password="x", first_name=f"S{n}", last_name="T")
    StudentProfile.objects.filter(user=user).update(personal_phone=phone, sms_opt_in=opt_in)
    return User.objects.get(pk=user.pk)


class Recorder:
    name = "recorder"

    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    def send(self, phone, message):
        if self.fail:
            raise RuntimeError("provider down")
        self.sent.append((phone, message))
        return "id-1"


@pytest.fixture
def sms_on():
    config = SMSConfiguration.get()
    config.enabled, config.monthly_limit = True, 5
    config.save()
    return config


@pytest.mark.django_db
class TestSendSms:
    def test_off_by_default_sends_and_logs_nothing(self):
        rec = Recorder()
        assert SMSConfiguration.get().enabled is False
        assert send_sms(make_student(1), "hi", SMSLog.TRIGGER_NEW_EVENT, provider=rec) is None
        assert rec.sent == [] and SMSLog.objects.count() == 0

    def test_not_opted_in_is_skipped(self, sms_on):
        rec = Recorder()
        assert send_sms(make_student(1, opt_in=False), "hi", SMSLog.TRIGGER_NEW_EVENT, provider=rec) is None
        assert rec.sent == []

    def test_sent_and_logged(self, sms_on):
        rec = Recorder()
        log = send_sms(make_student(1), "hello", SMSLog.TRIGGER_NEW_EVENT, provider=rec)
        assert rec.sent == [("+251911223344", "hello")]
        assert log.status == SMSLog.STATUS_SENT and log.provider_message_id == "id-1"

    def test_invalid_phone_is_logged_not_sent(self, sms_on):
        rec = Recorder()
        log = send_sms(make_student(1, phone="123"), "hi", SMSLog.TRIGGER_NEW_EVENT, provider=rec)
        assert log.status == SMSLog.STATUS_INVALID_PHONE and rec.sent == []

    def test_provider_failure_is_logged_and_does_not_raise(self, sms_on):
        log = send_sms(make_student(1), "hi", SMSLog.TRIGGER_NEW_EVENT, provider=Recorder(fail=True))
        assert log.status == SMSLog.STATUS_FAILED and "provider down" in log.error

    def test_long_text_is_cut(self, sms_on):
        log = send_sms(make_student(1), "x" * 500, SMSLog.TRIGGER_NEW_EVENT, provider=Recorder())
        assert len(log.message) == MAX_LENGTH

    def test_monthly_limit_stops_sending(self, sms_on):
        rec = Recorder()
        students = [make_student(i) for i in range(8)]
        # single-send path with our recorder, so no real provider is involved
        for s in students:
            send_sms(s, "hi", SMSLog.TRIGGER_NEW_EVENT, provider=rec, config=sms_on)
        assert len(rec.sent) == 5
        assert SMSLog.objects.filter(status=SMSLog.STATUS_LIMIT).count() == 3
        assert sms_on.remaining_this_month() == 0


@pytest.mark.django_db
class TestBulkAndProviders:
    def test_bulk_with_default_console_provider_respects_limit(self, sms_on):
        students = [make_student(i) for i in range(8)]
        assert send_sms_bulk(students, "hi", SMSLog.TRIGGER_NEW_EVENT) == 5
        assert SMSLog.objects.filter(status=SMSLog.STATUS_LIMIT).count() == 0  # bulk stops early, no noise
        assert {log.provider for log in SMSLog.objects.all()} == {"console"}

    def test_default_provider_is_free_console(self, monkeypatch):
        monkeypatch.delenv("SMS_PROVIDER", raising=False)
        assert isinstance(get_provider(), ConsoleProvider)

    def test_unknown_provider_fails_loudly(self, monkeypatch):
        monkeypatch.setenv("SMS_PROVIDER", "nope")
        with pytest.raises(RuntimeError, match="Unknown SMS_PROVIDER"):
            get_provider()

    def test_configuration_is_a_singleton(self):
        SMSConfiguration.objects.create(enabled=True)
        SMSConfiguration.objects.create(enabled=False)
        assert SMSConfiguration.objects.count() == 1


@pytest.mark.django_db
class TestTriggers:
    def test_private_answer_goes_to_asker_only(self, sms_on):
        asker = make_student(1)
        other = make_student(2)
        q = baker.make(Question, user=asker, visibility=Question.VISIBILITY_PRIVATE)
        SMSChannel().on_question_answered(baker.make(Answer, question=q))
        logs = SMSLog.objects.all()
        assert [l.user_id for l in logs] == [asker.id] and logs[0].trigger == SMSLog.TRIGGER_PRIVATE_ANSWER
        assert other.id not in [l.user_id for l in logs]

    def test_new_event_goes_to_opted_in_students(self, sms_on):
        yes, no = make_student(1), make_student(2, opt_in=False)
        SMSChannel().on_event_published(baker.make(Event, title="Retreat", service_group=None))
        assert [l.user_id for l in SMSLog.objects.all()] == [yes.id]
        assert "Retreat" in SMSLog.objects.get().message

    def test_nothing_happens_when_switched_off(self):
        make_student(1)
        SMSChannel().on_event_published(baker.make(Event, service_group=None))
        assert SMSLog.objects.count() == 0

    def test_weekly_reminder_command_sends_sms(self, sms_on):
        make_student(1)
        make_student(2, opt_in=False)
        call_command("send_weekly_reminders", verbosity=0)
        logs = SMSLog.objects.all()
        assert len(logs) == 1 and logs[0].trigger == SMSLog.TRIGGER_DONATION_REMINDER


@pytest.mark.django_db
class TestWeeklyReminderSchedule:
    URL = "/api/notifications/cron/weekly-reminders/"

    def test_second_run_in_same_week_is_skipped(self):
        make_student(1)
        call_command("send_weekly_reminders", verbosity=0)
        call_command("send_weekly_reminders", verbosity=0)
        assert Notification.objects.filter(notification_type=Notification.TYPE_REMINDER).count() == 1
        call_command("send_weekly_reminders", "--force", verbosity=0)
        assert Notification.objects.filter(notification_type=Notification.TYPE_REMINDER).count() == 2

    def test_graduates_get_the_reminder_too(self):
        make_student(1)
        grad = make_student(2)
        StudentProfile.objects.filter(user=grad).update(status=StudentProfile.GRADUATED)
        call_command("send_weekly_reminders", verbosity=0)
        got = set(Notification.objects.filter(notification_type=Notification.TYPE_REMINDER).values_list("user_id", flat=True))
        assert grad.id in got and len(got) == 2

    def test_trigger_disabled_without_secret(self, settings):
        settings.CRON_SECRET = ""
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="").status_code == 404

    def test_trigger_rejects_wrong_token(self, settings):
        settings.CRON_SECRET = "right-secret"
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="wrong").status_code == 404

    def test_trigger_sends_once(self, settings):
        settings.CRON_SECRET = "right-secret"
        make_student(1)
        first = APIClient().post(self.URL, HTTP_X_CRON_TOKEN="right-secret")
        assert first.status_code == 200 and first.json()["status"] == "sent"
        second = APIClient().post(self.URL, HTTP_X_CRON_TOKEN="right-secret")
        assert second.json()["status"] == "skipped"


@pytest.mark.django_db
class TestProfileOptIn:
    def api(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_cannot_opt_in_without_valid_phone(self):
        user = make_student(1, phone="", opt_in=False)
        res = self.api(user).patch("/api/student/profiles/me/", {"sms_opt_in": True}, format="json")
        assert res.status_code == 400 and "sms_opt_in" in res.json()

    def test_opt_in_with_phone_and_opt_out(self):
        user = make_student(1, phone="", opt_in=False)
        client = self.api(user)
        res = client.patch("/api/student/profiles/me/", {"personal_phone": "0911223344", "sms_opt_in": True}, format="json")
        assert res.status_code == 200 and res.json()["sms_opt_in"] is True
        res = client.patch("/api/student/profiles/me/", {"sms_opt_in": False}, format="json")
        assert res.status_code == 200 and res.json()["sms_opt_in"] is False


@pytest.mark.django_db
class TestWeeklyReminderEmailAndAmount:
    def test_message_names_the_amount_and_it_comes_from_the_setting(self, settings):
        from notifications.reminders import message

        assert "10 birr" in message()
        settings.WEEKLY_DONATION_AMOUNT = 25
        assert "25 birr" in message()

    def test_everyone_with_an_email_gets_the_reminder_by_email_and_in_app(self, mailoutbox):
        make_student(1)
        make_student(2)
        call_command("send_weekly_reminders", verbosity=0)
        assert len(mailoutbox) == 2
        mail = mailoutbox[0]
        assert mail.subject == "Weekly donation reminder" and "10 birr" in mail.body and "dashboard/donations/give" in mail.alternatives[0][0]
        assert Notification.objects.filter(notification_type=Notification.TYPE_REMINDER, message__contains="10 birr").count() == 2

    def test_a_student_without_an_email_still_gets_the_in_app_reminder(self, mailoutbox):
        make_student(1)
        nomail = make_student(2)
        User.objects.filter(pk=nomail.pk).update(email="")
        call_command("send_weekly_reminders", verbosity=0)
        assert len(mailoutbox) == 1
        assert Notification.objects.filter(user=nomail, notification_type=Notification.TYPE_REMINDER).exists()

    def test_the_email_limit_caps_one_run_and_says_how_many_were_left_out(self, settings, mailoutbox):
        from notifications.reminders import send_weekly_reminders

        settings.WEEKLY_REMINDER_EMAIL_LIMIT = 2
        for i in range(1, 5):
            make_student(i)
        result = send_weekly_reminders(force=True)
        assert result["emails"] == 2 and result["emails_skipped"] == 2 and len(mailoutbox) == 2
        assert result["users"] == 4  # everybody still gets the in-app reminder

    def test_a_second_run_in_the_same_week_sends_no_second_email(self, mailoutbox):
        make_student(1)
        call_command("send_weekly_reminders", verbosity=0)
        call_command("send_weekly_reminders", verbosity=0)
        assert len(mailoutbox) == 1

    def test_a_broken_mail_server_does_not_stop_the_reminder(self, monkeypatch):
        import django.core.mail as mail
        from notifications.reminders import send_weekly_reminders

        def broken(*args, **kwargs):
            raise ConnectionError("smtp down")

        make_student(1)
        monkeypatch.setattr(mail, "get_connection", broken)
        result = send_weekly_reminders(force=True)
        assert result["status"] == "sent" and result["users"] == 1 and result["emails"] == 0
        assert Notification.objects.filter(notification_type=Notification.TYPE_REMINDER).count() == 1

    def test_the_web_trigger_answers_at_once_and_still_sends(self, settings, mailoutbox):
        settings.CRON_SECRET = "right"
        make_student(1)
        res = APIClient().post("/api/notifications/cron/weekly-reminders/", HTTP_X_CRON_TOKEN="right")
        assert res.status_code == 200 and res.json()["status"] == "sent" and res.json()["emails"] == 1


@pytest.mark.django_db
class TestReminderEmailSafety:
    def test_made_up_addresses_are_never_emailed_by_default(self, settings, mailoutbox):
        from notifications.reminders import send_weekly_reminders

        settings.REMINDER_EMAIL_SKIP_UNDELIVERABLE = True
        make_student(1)  # s1@finot.test: a reserved test address
        real = make_student(2)
        User.objects.filter(pk=real.pk).update(email="real.person@gmail.com")
        result = send_weekly_reminders(force=True)
        assert [m.to for m in mailoutbox] == [["real.person@gmail.com"]]
        assert result["emails"] == 1 and result["users"] == 2  # both still get the in-app reminder

    def test_which_addresses_count_as_undeliverable(self):
        from notifications.reminders import is_deliverable

        for bad in ("a@finot.test", "a@x.example", "a@example.com", "a@foo.invalid", "a@localhost", "", "nonsense"):
            assert not is_deliverable(bad), bad
        for good in ("a@gmail.com", "b@university.edu.et", "c@finot.org"):
            assert is_deliverable(good), good

    def test_test_email_sends_one_message_and_notifies_nobody_else(self, mailoutbox):
        make_student(1)
        call_command("send_weekly_reminders", "--test-email", "me@gmail.com", verbosity=0)
        assert [m.to for m in mailoutbox] == [["me@gmail.com"]]
        assert "10 birr" in mailoutbox[0].body
        assert Notification.objects.filter(notification_type=Notification.TYPE_REMINDER).count() == 0
