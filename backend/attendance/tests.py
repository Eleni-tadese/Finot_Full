"""
Smart attendance: sessions, badges, room codes, scanning, self check-in, closing.
The Present/Absent rows must land in the existing tables (service.ServiceAttendance, course.AttendanceRecord).
"""
from datetime import datetime, timedelta, timezone

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone as tz
from model_bakery import baker
from rest_framework.test import APIClient

from attendance import codes
from attendance.models import AttendanceSession, CheckIn
from core.models import Role, UserRole
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse
from service.models import Event, ServiceAttendance, ServiceGroup, ServiceGroupMembership
from student.models import StudentProfile

User = get_user_model()
A = "/api/attendance/"


def make_user(email, role=None, status=StudentProfile.IN_CAMPUS):
    u = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=u, role=Role.objects.get_or_create(name=role)[0])
    StudentProfile.objects.update_or_create(user=u, defaults={"status": status})
    return User.objects.get(pk=u.pk)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def badge(user):
    return codes.badge_for(user.id, user.student_profile.badge_version)


class World:
    pass


@pytest.fixture
def w():
    w = World()
    w.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
    w.manager = make_user("em@x.test", Role.EVENT_MANAGER)
    w.other_manager = make_user("em2@x.test", Role.EVENT_MANAGER)
    w.sa = make_user("sa@x.test", Role.SERVICE_ADMIN)
    w.coord = make_user("coord@x.test", Role.COURSE_COORDINATOR)
    w.s1, w.s2, w.s3 = make_user("s1@x.test"), make_user("s2@x.test"), make_user("s3@x.test")
    w.grad = make_user("grad@x.test", status=StudentProfile.GRADUATED)
    now = tz.now()
    w.general = baker.make(Event, title="Fellowship day", service_group=None, created_by=w.manager,
                           start_date=now - timedelta(hours=1), end_date=now + timedelta(hours=2))
    w.group = baker.make(ServiceGroup, name="Choir", admin=w.sa)
    ServiceGroupMembership.objects.create(service_group=w.group, student=w.s1, status=ServiceGroupMembership.ACTIVE)
    w.group_event = baker.make(Event, title="Rehearsal", service_group=w.group, created_by=w.sa,
                               start_date=now - timedelta(hours=1), end_date=now + timedelta(hours=1))
    w.course = SemesterCourse.objects.create(course=Course.objects.create(title="Bible", batch_year=1),
                                             academic_year=2026, semester=1, status="OPEN")
    w.course.coordinators.add(w.coord)
    CourseEnrollment.objects.create(semester_course=w.course, student=w.s1)
    CourseEnrollment.objects.create(semester_course=w.course, student=w.s2)
    from attendance.rules import today_in_ethiopia

    w.day = CourseSession.objects.create(semester_course=w.course, date=today_in_ethiopia())
    return w


def open_event(w, user=None, event=None):
    res = client_for(user or w.manager).post(A + "sessions/open/", {"event_id": (event or w.general).id}, format="json")
    assert res.status_code in (200, 201), res.content
    return res.json()["id"]


# ---- codes -------------------------------------------------------------------------------------------------

class TestCodes:
    def test_badge_round_trip_and_tampering(self):
        text = codes.badge_for(42, 3)
        assert text.startswith("FB1.42.3.") and codes.parse_badge(text) == (42, 3)
        assert codes.parse_badge(text[:-1] + ("0" if text[-1] != "0" else "1")) is None
        assert codes.parse_badge("FB1.43.3." + text.split(".")[-1]) is None
        assert codes.parse_badge("") is None and codes.parse_badge("hello") is None

    def test_room_code_changes_every_30_seconds_and_accepts_the_previous_window(self):
        t = 1_700_000_000
        now_code, prev_code, old_code = codes.room_code(7, t), codes.room_code(7, t - 30), codes.room_code(7, t - 60)
        assert len(now_code) == 6 and now_code.isdigit()
        assert codes.room_code(7, t + 5) == now_code
        assert codes.room_code_is_valid(7, now_code, t) and codes.room_code_is_valid(7, prev_code, t)
        assert not codes.room_code_is_valid(7, old_code, t)
        assert codes.room_code(8, t) != now_code
        assert not codes.room_code_is_valid(7, "12345", t) and not codes.room_code_is_valid(7, None, t)
        assert codes.room_qr_text(7, t) == f"FS1.7.{now_code}"


# ---- opening -----------------------------------------------------------------------------------------------

@pytest.mark.django_db
class TestOpening:
    def test_event_manager_opens_own_general_event_only(self, w):
        assert client_for(w.manager).post(A + "sessions/open/", {"event_id": w.general.id}, format="json").status_code == 201
        assert client_for(w.other_manager).post(A + "sessions/open/", {"event_id": w.general.id}, format="json").status_code == 403
        assert client_for(w.s1).post(A + "sessions/open/", {"event_id": w.general.id}, format="json").status_code == 403

    def test_service_admin_opens_own_group_event_and_super_admin_anything(self, w):
        assert client_for(w.sa).post(A + "sessions/open/", {"event_id": w.group_event.id}, format="json").status_code == 201
        assert client_for(w.sa).post(A + "sessions/open/", {"event_id": w.general.id}, format="json").status_code == 403
        assert client_for(w.boss).post(A + "sessions/open/", {"event_id": w.general.id}, format="json").status_code == 201

    def test_coordinator_opens_a_class_day_of_their_course(self, w):
        res = client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json")
        assert res.status_code == 201 and res.json()["kind"] == "class_day" and res.json()["roster"] == 2
        assert client_for(w.manager).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").status_code == 403

    def test_an_event_opens_only_around_its_own_time(self, w):
        client = client_for(w.manager)
        far = baker.make(Event, title="In three days", service_group=None, created_by=w.manager,
                         start_date=tz.now() + timedelta(days=3), end_date=tz.now() + timedelta(days=3, hours=2))
        res = client.post(A + "sessions/open/", {"event_id": far.id}, format="json")
        assert res.status_code == 400 and res.json()["code"] == "not_yet"
        soon = baker.make(Event, title="Starts in 30 minutes", service_group=None, created_by=w.manager,
                          start_date=tz.now() + timedelta(minutes=30), end_date=tz.now() + timedelta(hours=2))
        assert client.post(A + "sessions/open/", {"event_id": soon.id}, format="json").status_code == 201
        old = baker.make(Event, title="Last week", service_group=None, created_by=w.manager,
                         start_date=tz.now() - timedelta(days=7), end_date=tz.now() - timedelta(days=7) + timedelta(hours=2))
        res = client.post(A + "sessions/open/", {"event_id": old.id}, format="json")
        assert res.status_code == 400 and res.json()["code"] == "ended"

    def test_a_session_cannot_be_reopened_after_the_event_is_over(self, w):
        sid = open_event(w)
        client = client_for(w.manager)
        assert client.post(A + f"sessions/{sid}/close/").status_code == 200
        assert client.post(A + f"sessions/{sid}/reopen/").status_code == 200  # still within the window
        client.post(A + f"sessions/{sid}/close/")
        past = tz.now() - timedelta(days=3)
        Event.objects.filter(pk=w.general.pk).update(start_date=past, end_date=past + timedelta(hours=2))
        res = client.post(A + f"sessions/{sid}/reopen/")
        assert res.status_code == 400 and res.json()["code"] == "ended"

    def test_opening_twice_returns_the_same_open_session(self, w):
        first = open_event(w)
        res = client_for(w.manager).post(A + "sessions/open/", {"event_id": w.general.id}, format="json")
        assert res.status_code == 200 and res.json()["id"] == first
        assert AttendanceSession.objects.count() == 1

    def test_auto_close_defaults(self, w):
        sid = open_event(w)
        assert AttendanceSession.objects.get(pk=sid).auto_close_at == w.general.end_date + timedelta(hours=2)
        day = AttendanceSession.default_auto_close(course_session=w.day)
        assert day.hour == 18 and day.tzinfo is not None  # 21:00 Ethiopia

    def test_only_the_day_itself_can_be_scanned_and_a_future_day_cannot_be_marked(self, w):
        from attendance.rules import today_in_ethiopia

        tomorrow = CourseSession.objects.create(semester_course=w.course, date=today_in_ethiopia() + timedelta(days=1))
        yesterday = CourseSession.objects.create(semester_course=w.course, date=today_in_ethiopia() - timedelta(days=1))
        for day in (tomorrow, yesterday):
            res = client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(day.id)}, format="json")
            assert res.status_code == 400 and res.json()["code"] == "not_today"
        assert client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").status_code in (200, 201)
        body = {"records": [{"student_id": w.s1.id, "status": "PRESENT"}]}
        assert client_for(w.coord).post(f"/api/course/attendance/bulk-mark/{tomorrow.id}/", body, format="json").status_code == 400
        assert client_for(w.coord).post(f"/api/course/attendance/bulk-mark/{yesterday.id}/", body, format="json").status_code in (200, 201)

    def test_completed_course_cannot_open(self, w):
        w.course.status = "COMPLETED"
        w.course.save()
        assert client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").status_code == 400

    def test_current_and_open_for_me(self, w):
        sid = open_event(w)
        assert client_for(w.manager).get(A + "sessions/current/", {"event_id": w.general.id}).json()["id"] == sid
        assert client_for(w.s1).get(A + "sessions/current/", {"event_id": w.general.id}).status_code == 200  # on the roster
        assert client_for(w.grad).get(A + "sessions/current/", {"event_id": w.general.id}).status_code == 403
        mine = client_for(w.s1).get(A + "sessions/open-for-me/").json()
        assert [m["id"] for m in mine] == [sid] and mine[0]["checked_in"] is False
        assert client_for(w.grad).get(A + "sessions/open-for-me/").json() == []


# ---- scanning ----------------------------------------------------------------------------------------------

@pytest.mark.django_db
class TestScanning:
    def test_scan_marks_present_in_the_real_table_and_logs_the_check_in(self, w):
        sid = open_event(w)
        res = client_for(w.manager).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["ok"] and body["already"] is False and body["student"]["name"] == "s1 T" and body["present"] == 1
        assert ServiceAttendance.objects.get(event=w.general, student=w.s1).status == "PRESENT"
        ci = CheckIn.objects.get()
        assert ci.method == "BADGE" and ci.scanned_by == w.manager and ci.student == w.s1

    def test_second_scan_is_reported_as_already(self, w):
        sid = open_event(w)
        c = client_for(w.manager)
        c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        res = c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        assert res.status_code == 200 and res.json()["already"] is True
        assert CheckIn.objects.count() == 1 and ServiceAttendance.objects.count() == 1

    def test_bad_old_and_foreign_badges_are_rejected(self, w):
        sid = open_event(w)
        c = client_for(w.manager)
        assert c.post(A + f"sessions/{sid}/scan/", {"badge": "nonsense"}, format="json").json()["code"] == "bad_badge"
        old = badge(w.s1)
        StudentProfile.objects.filter(user=w.s1).update(badge_version=2)
        assert c.post(A + f"sessions/{sid}/scan/", {"badge": old}, format="json").json()["code"] == "old_badge"
        res = c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.grad)}, format="json")
        assert res.status_code == 400 and res.json()["code"] == "not_on_roster"
        assert ServiceAttendance.objects.count() == 0

    def test_group_event_roster_is_the_group(self, w):
        sid = open_event(w, w.sa, w.group_event)
        c = client_for(w.sa)
        assert c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json").status_code == 200
        assert c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s2)}, format="json").json()["code"] == "not_on_roster"

    def test_class_day_scan_writes_a_course_attendance_record(self, w):
        sid = client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").json()["id"]
        res = client_for(w.coord).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        assert res.status_code == 200
        rec = AttendanceRecord.objects.get(session=w.day, student=w.s1)
        assert rec.status == "PRESENT" and rec.marked_by == w.coord
        assert client_for(w.coord).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s3)}, format="json").json()["code"] == "not_on_roster"

    def test_only_scanners_may_scan_and_helpers_may_scan_but_not_close(self, w):
        sid = open_event(w)
        assert client_for(w.s2).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json").status_code == 403
        assert client_for(w.other_manager).get(A + f"sessions/{sid}/code/").status_code == 403
        assert client_for(w.manager).post(A + f"sessions/{sid}/helpers/", {"user_ids": [w.s2.id]}, format="json").status_code == 200
        assert client_for(w.s2).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json").status_code == 200
        assert client_for(w.s2).get(A + f"sessions/{sid}/code/").status_code == 200
        assert client_for(w.s2).post(A + f"sessions/{sid}/close/").status_code == 403
        assert client_for(w.s2).post(A + f"sessions/{sid}/helpers/", {"user_ids": []}, format="json").status_code == 403

    def test_sync_takes_a_list_and_can_be_repeated(self, w):
        sid = open_event(w)
        when = (tz.now() - timedelta(minutes=10)).isoformat()
        scans = [{"badge": badge(w.s1), "scanned_at": when}, {"badge": badge(w.s2)}, {"badge": "junk"}, {"badge": badge(w.grad)}]
        res = client_for(w.manager).post(A + f"sessions/{sid}/sync/", {"scans": scans}, format="json")
        assert res.status_code == 200
        body = res.json()
        assert body["accepted"] == 2 and [r["ok"] for r in body["results"]] == [True, True, False, False]
        assert CheckIn.objects.get(student=w.s1).scanned_at == datetime.fromisoformat(when)
        again = client_for(w.manager).post(A + f"sessions/{sid}/sync/", {"scans": scans}, format="json").json()
        assert again["accepted"] == 2 and again["results"][0]["already"] is True and CheckIn.objects.count() == 2
        assert client_for(w.manager).post(A + f"sessions/{sid}/sync/", {"scans": "no"}, format="json").status_code == 400

    def test_a_manual_absent_becomes_present_when_scanned(self, w):
        sid = open_event(w)
        ServiceAttendance.objects.create(event=w.general, student=w.s1, status="ABSENT")
        client_for(w.manager).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        assert ServiceAttendance.objects.get(event=w.general, student=w.s1).status == "PRESENT"


# ---- self check-in -----------------------------------------------------------------------------------------

@pytest.mark.django_db
class TestSelfCheckIn:
    def test_right_code_marks_present_wrong_code_does_not(self, w):
        sid = open_event(w)
        shown = client_for(w.manager).get(A + f"sessions/{sid}/code/").json()
        assert len(shown["code"]) == 6 and 0 < shown["seconds_left"] <= 30 and shown["qr"] == f"FS1.{sid}.{shown['code']}"
        wrong = "000000" if shown["code"] != "000000" else "000001"
        assert client_for(w.s1).post(A + f"sessions/{sid}/self-check-in/", {"code": wrong}, format="json").json()["code"] == "wrong_code"
        res = client_for(w.s1).post(A + f"sessions/{sid}/self-check-in/", {"code": shown["code"]}, format="json")
        assert res.status_code == 200 and res.json()["ok"] and res.json()["session"]["present"] == 1
        assert CheckIn.objects.get().method == "CODE"
        assert ServiceAttendance.objects.get(event=w.general, student=w.s1).status == "PRESENT"

    def test_a_student_off_the_roster_is_refused_even_with_the_right_code(self, w):
        sid = open_event(w)
        code = client_for(w.manager).get(A + f"sessions/{sid}/code/").json()["code"]
        res = client_for(w.grad).post(A + f"sessions/{sid}/self-check-in/", {"code": code}, format="json")
        assert res.status_code == 400 and res.json()["code"] == "not_on_roster"

    def test_students_never_see_the_code(self, w):
        sid = open_event(w)
        assert client_for(w.s1).get(A + f"sessions/{sid}/code/").status_code == 403


# ---- closing -----------------------------------------------------------------------------------------------

@pytest.mark.django_db
class TestClosing:
    def test_close_marks_the_rest_absent_and_blocks_scans(self, w):
        sid = open_event(w)
        c = client_for(w.manager)
        c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        res = c.post(A + f"sessions/{sid}/close/")
        assert res.status_code == 200 and res.json()["status"] == "CLOSED"
        roster = {w.s1, w.s2, w.s3, w.manager, w.other_manager, w.sa, w.coord, w.boss}  # every active in-campus user
        assert res.json()["marked_absent"] == len(roster) - 1
        assert ServiceAttendance.objects.get(event=w.general, student=w.s2).status == "ABSENT"
        assert ServiceAttendance.objects.filter(event=w.general, student=w.grad).count() == 0
        res = c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s2)}, format="json")
        assert res.status_code == 400 and res.json()["code"] == "closed"
        assert c.get(A + f"sessions/{sid}/code/").status_code == 409
        assert c.post(A + f"sessions/{sid}/close/").json()["marked_absent"] == 0  # closing twice changes nothing

    def test_reopen_lets_a_late_student_in(self, w):
        sid = open_event(w)
        c = client_for(w.manager)
        c.post(A + f"sessions/{sid}/close/")
        assert c.post(A + f"sessions/{sid}/reopen/").json()["status"] == "OPEN"
        assert c.post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s2)}, format="json").status_code == 200
        assert ServiceAttendance.objects.get(event=w.general, student=w.s2).status == "PRESENT"

    def test_close_on_a_class_day_marks_absent_with_the_closer(self, w):
        sid = client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").json()["id"]
        client_for(w.coord).post(A + f"sessions/{sid}/scan/", {"badge": badge(w.s1)}, format="json")
        assert client_for(w.coord).post(A + f"sessions/{sid}/close/").json()["marked_absent"] == 1
        rec = AttendanceRecord.objects.get(session=w.day, student=w.s2)
        assert rec.status == "ABSENT" and rec.marked_by == w.coord

    def test_forgotten_sessions_are_closed_by_the_command(self, w):
        sid = open_event(w)
        AttendanceSession.objects.filter(pk=sid).update(auto_close_at=tz.now() - timedelta(minutes=1))
        fresh = client_for(w.coord).post(A + "sessions/open/", {"course_session_id": str(w.day.id)}, format="json").json()["id"]
        # a class day auto-closes at 21:00 Ethiopia; pin the time so the test also passes when run later in the evening
        AttendanceSession.objects.filter(pk=fresh).update(auto_close_at=tz.now() + timedelta(hours=1))
        call_command("close_stale_attendance_sessions")
        assert AttendanceSession.objects.get(pk=sid).closed_at is not None
        assert AttendanceSession.objects.get(pk=fresh).closed_at is None
        assert ServiceAttendance.objects.filter(event=w.general, status="ABSENT").count() == 8


# ---- badge -------------------------------------------------------------------------------------------------

@pytest.mark.django_db
class TestBadge:
    def test_my_badge_matches_my_version(self, w):
        res = client_for(w.s1).get(A + "badge/me/")
        assert res.status_code == 200 and res.json()["badge"] == badge(w.s1) and res.json()["version"] == 1
        StudentProfile.objects.filter(user=w.s1).update(badge_version=2)
        assert res.json()["badge"] != client_for(w.s1).get(A + "badge/me/").json()["badge"]

    def test_anonymous_gets_nothing(self, w):
        assert APIClient().get(A + "badge/me/").status_code == 401
