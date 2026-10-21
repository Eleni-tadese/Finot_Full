"""Small fixes found while researching the attendance work (2026-10-21)."""
from datetime import date, datetime, timezone

import pytest
from model_bakery import baker

from analytics.dashboard_stats import get_analytics_stats
from analytics.exports import events_sheets
from course.models import AttendanceRecord, CourseSession
from notifications.channels.sms import SMSChannel
from notifications.models import SMSConfiguration, SMSLog
from service.models import Event, ServiceGroup, ServiceGroupMembership
from student.models import StudentProfile


def student(email, opt_in=True):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(username=email, email=email, password="x", first_name="S", last_name="T")
    StudentProfile.objects.filter(user=user).update(personal_phone="0911223344", sms_opt_in=opt_in)
    return user


@pytest.mark.django_db
def test_events_export_shows_the_computed_status_not_the_stored_one():
    baker.make(Event, title="Old", status=Event.UPCOMING,
               start_date=datetime(2020, 1, 1, 9, tzinfo=timezone.utc), end_date=datetime(2020, 1, 1, 10, tzinfo=timezone.utc))
    (sheet,) = events_sheets()
    rows = list(sheet.rows)
    assert rows[0][0] == "Old" and rows[0][1] == Event.COMPLETED


@pytest.mark.django_db
def test_group_event_sms_goes_to_the_group_members_only():
    config = SMSConfiguration.get()
    config.enabled, config.monthly_limit = True, 10
    config.save()
    member, outsider = student("m@finot.test"), student("o@finot.test")
    group = baker.make(ServiceGroup, name="Choir")
    ServiceGroupMembership.objects.create(service_group=group, student=member, status=ServiceGroupMembership.ACTIVE)
    SMSChannel().on_event_published(baker.make(Event, title="Rehearsal", service_group=group))
    assert [l.user_id for l in SMSLog.objects.all()] == [member.id]
    assert outsider.id not in [l.user_id for l in SMSLog.objects.all()]


@pytest.mark.django_db
def test_super_admin_attendance_progress_reads_the_class_day_date():
    session = baker.make(CourseSession, date=date.today())
    baker.make(AttendanceRecord, session=session, student=student("p@finot.test"), status="PRESENT")
    baker.make(AttendanceRecord, session=session, student=student("a@finot.test"), status="ABSENT")
    stats = get_analytics_stats()
    assert stats["attendance_progress_labels"] != '["No Data"]'
    assert stats["attendance_progress_rates"] == "[50.0]"
