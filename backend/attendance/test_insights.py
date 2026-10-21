"""Charts and simple predictions: who sees which events, counts and rates, at-risk list, next-session estimate, my months."""
from datetime import timedelta

import pytest
from django.utils import timezone as tz
from model_bakery import baker

from attendance.insights import course_insights, event_insights, my_insights
from attendance.tests import A, client_for, make_user, w  # noqa: F401  (the shared world fixture)
from course.models import AttendanceRecord, CourseSession
from service.models import Event, ServiceAttendance

I = A + "insights/"


def past_event(w, title, days_ago, present=(), absent=()):
    start = tz.now() - timedelta(days=days_ago)
    event = baker.make(Event, title=title, service_group=None, created_by=w.manager, start_date=start, end_date=start + timedelta(hours=2))
    for u in present:
        ServiceAttendance.objects.create(event=event, student=u, status="PRESENT")
    for u in absent:
        ServiceAttendance.objects.create(event=event, student=u, status="ABSENT")
    return event


@pytest.mark.django_db
class TestEventInsights:
    def test_rows_counts_rate_and_scope(self, w):
        past_event(w, "Old one", 10, present=[w.s1], absent=[w.s2])
        data = event_insights(w.manager, scope="mine")
        old = next(r for r in data["events"] if r["title"] == "Old one")
        roster = old["roster"]
        assert old["present"] == 1 and old["absent"] == 1 and old["unmarked"] == roster - 2 and old["counted"] is True
        assert old["rate"] == round(100 / roster, 1)
        assert "Rehearsal" not in [r["title"] for r in data["events"]]  # the group event is not the manager's
        assert "Rehearsal" in [r["title"] for r in event_insights(w.sa, scope="group")["events"]]
        assert event_insights(w.other_manager, scope="mine")["events"] == []

    def test_at_risk_and_next_event_estimate(self, w):
        for days in (9, 6, 3):
            past_event(w, f"E{days}", days, present=[w.s1], absent=[w.s2, w.s3])
        start = tz.now() + timedelta(days=2)
        baker.make(Event, title="Next", service_group=None, created_by=w.manager, start_date=start, end_date=start + timedelta(hours=1))
        data = event_insights(w.manager, scope="mine")
        risk_ids = {p["id"] for p in data["at_risk"]}
        assert w.s2.id in risk_ids and w.s3.id in risk_ids and w.s1.id not in risk_ids
        assert data["at_risk_total"] == len(data["at_risk"])
        nxt = data["next"]
        assert nxt["title"] == "Next" and nxt["based_on"] == 3
        assert nxt["expected_rate"] == data["average_rate"] and nxt["expected_present"] == round(nxt["roster"] * nxt["expected_rate"] / 100)

    def test_endpoint_scopes_and_permissions(self, w):
        past_event(w, "Old one", 5, present=[w.s1])
        res = client_for(w.boss).get(I + "events/", {"scope": "all"})
        assert res.status_code == 200 and len(res.json()["events"]) >= 2
        assert client_for(w.manager).get(I + "events/", {"scope": "nope"}).status_code == 400
        assert client_for(w.s1).get(I + "events/", {"scope": "mine"}).json()["events"] == []  # a student manages nothing
        group = client_for(w.sa).get(I + "events/", {"scope": "group", "group_id": w.group.id}).json()
        assert [r["title"] for r in group["events"]] == ["Rehearsal"]


@pytest.mark.django_db
class TestCourseInsights:
    def test_days_at_risk_and_next_day(self, w):
        today = tz.localdate()
        for days in (7, 5, 3):
            day = CourseSession.objects.create(semester_course=w.course, date=today - timedelta(days=days), topic=f"T{days}")
            AttendanceRecord.objects.create(session=day, student=w.s1, status="PRESENT", marked_by=w.coord)
            AttendanceRecord.objects.create(session=day, student=w.s2, status="ABSENT", marked_by=w.coord)
        data = course_insights(w.course)
        assert [r["present"] for r in data["events"]] == [1, 1, 1] and data["events"][0]["rate"] == 50.0
        assert [p["id"] for p in data["at_risk"]] == [w.s2.id]
        assert data["next"]["date"] == today and data["next"]["expected_present"] == 1 and data["next"]["expected_rate"] == 50.0

    def test_endpoint_permissions(self, w):
        url = I + f"courses/{w.course.id}/"
        assert client_for(w.coord).get(url).status_code == 200
        assert client_for(w.boss).get(url).status_code == 200
        assert client_for(w.s1).get(url).status_code == 403
        assert client_for(w.manager).get(url).status_code == 403


@pytest.mark.django_db
class TestMyInsights:
    def test_months_and_streak(self, w):
        past_event(w, "A", 2, present=[w.s1])
        past_event(w, "B", 1, present=[w.s1])
        past_event(w, "C", 40, absent=[w.s1])
        AttendanceRecord.objects.create(session=w.day, student=w.s1, status="PRESENT", marked_by=w.coord)  # w.day is today
        data = client_for(w.s1).get(I + "me/").json()
        assert data["streak"] == 2 and len(data["months"]) == 6
        this_month = data["months"][-1]
        assert this_month["events_present"] >= 1 and this_month["classes_present"] == 1
        assert sum(m["events_absent"] for m in data["months"]) == 1
