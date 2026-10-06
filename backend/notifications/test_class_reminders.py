from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from model_bakery import baker
from rest_framework.test import APIClient

from course.models import Course, CourseEnrollment, CourseSession, SemesterCourse
from notifications.class_reminders import send_class_reminders
from notifications.models import Notification

User = get_user_model()
TODAY = date(2026, 10, 5)  # a Monday


def person(email, active=True):
    return User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T", is_active=active)


def reminders():
    return Notification.objects.filter(notification_type=Notification.TYPE_REMINDER)


@pytest.mark.django_db
class TestClassReminders:
    def setup_method(self):
        self.sc = baker.make(SemesterCourse, course=baker.make(Course, title="Doctrine", batch_year=1), academic_year=2026, semester=1, status="OPEN")
        self.a, self.b = person("a@x.test"), person("b@x.test")
        for s in (self.a, self.b):
            CourseEnrollment.objects.get_or_create(semester_course=self.sc, student=s)
        self.outsider = person("o@x.test")  # not in the course

    def day(self, offset, **extra):
        return CourseSession.objects.create(semester_course=self.sc, date=TODAY + timedelta(days=offset), **extra)

    def test_students_of_tomorrows_class_are_told_once(self):
        self.day(1, topic="Creation", teacher_name="Abba T")
        out = send_class_reminders(today=TODAY)
        assert out["sessions"] == 1 and out["students"] == 2
        note = reminders().get(user=self.a)
        assert "Class tomorrow: Doctrine" in note.title and "Creation" in note.message and "Abba T" in note.message
        assert "Tuesday, 06 October 2026" in note.message
        assert not reminders().filter(user=self.outsider).exists()
        assert send_class_reminders(today=TODAY)["sessions"] == 0  # not announced twice
        assert reminders().count() == 2

    def test_only_tomorrow_counts(self):
        self.day(0)
        self.day(2)
        assert send_class_reminders(today=TODAY)["sessions"] == 0 and reminders().count() == 0

    def test_moving_the_date_announces_the_new_date_again(self):
        session = self.day(1)
        send_class_reminders(today=TODAY)
        c = APIClient()
        boss = person("boss@x.test")
        from core.models import Role, UserRole
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.COURSE_COORDINATOR)[0])
        c.force_authenticate(User.objects.get(pk=boss.pk))
        self.sc.coordinators.add(boss)
        new_date = (TODAY + timedelta(days=3)).isoformat()
        assert c.patch(f"/api/course/sessions/{session.id}/", {"date": new_date}, format="json").status_code == 200
        session.refresh_from_db()
        assert session.reminder_sent_at is None
        assert send_class_reminders(today=TODAY + timedelta(days=2))["sessions"] == 1

    def test_inactive_students_are_skipped_and_force_repeats(self):
        gone = person("gone@x.test", active=False)
        CourseEnrollment.objects.create(semester_course=self.sc, student=gone)
        self.day(1)
        assert send_class_reminders(today=TODAY)["students"] == 2
        assert send_class_reminders(today=TODAY, force=True)["sessions"] == 1

    def test_command_runs(self, capsys):
        self.day(1)
        call_command("send_class_reminders", "--today", "2026-10-05", verbosity=0)
        assert reminders().count() == 2


@pytest.mark.django_db
class TestClassReminderTrigger:
    URL = "/api/notifications/cron/class-reminders/"

    def test_needs_the_secret(self, settings):
        settings.CRON_SECRET = ""
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="").status_code == 404
        settings.CRON_SECRET = "right"
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="wrong").status_code == 404
        assert APIClient().post(self.URL, HTTP_X_CRON_TOKEN="right").status_code == 200
