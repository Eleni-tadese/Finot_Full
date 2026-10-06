import datetime

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Role, UserRole
from course.models import (
    AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse,
)

User = get_user_model()


def make_user(email, role_name=None):
    user = User.objects.create_user(
        username=email, email=email, password="Pass@12345", first_name=email.split("@")[0], last_name="T"
    )
    if role_name:
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.create(user=user, role=role)
    return user


def api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def course_setup():
    course = Course.objects.create(title="Doctrine", batch_year=1)
    sc = SemesterCourse.objects.create(course=course, academic_year=2026, semester=1, status="OPEN")
    s1, s2 = make_user("s1@finot.test"), make_user("s2@finot.test")
    for s in (s1, s2):
        CourseEnrollment.objects.create(semester_course=sc, student=s)
    day = datetime.date(2026, 1, 1)
    sessions = [CourseSession.objects.create(semester_course=sc, date=day + datetime.timedelta(days=i)) for i in range(4)]
    # 3 sessions held (marked), the 4th never marked
    marks = {s1: ["PRESENT", "PRESENT", "ABSENT"], s2: ["PRESENT", "ABSENT", "ABSENT"]}
    for student, statuses in marks.items():
        for session, status in zip(sessions, statuses):
            AttendanceRecord.objects.create(session=session, student=student, status=status)
    return sc, s1, s2


@pytest.mark.django_db
class TestAttendanceReport:
    def test_report_numbers(self, course_setup):
        sc, s1, s2 = course_setup
        coordinator = make_user("c@finot.test", Role.COURSE_COORDINATOR)
        sc.coordinators.add(coordinator)
        data =api(coordinator).get(f"/api/course/semester-courses/{sc.id}/attendance-report/").json()
        assert data["sessions_total"] == 4 and data["sessions_held"] == 3
        by_user = {r["username"]: r for r in data["students"]}
        assert by_user["s1@finot.test"]["present"] == 2 and by_user["s1@finot.test"]["percentage"] == 66.7
        assert by_user["s2@finot.test"]["percentage"] == 33.3
        assert data["average_percentage"] == 50.0

    def test_report_forbidden_for_student(self, course_setup):
        sc, s1, _ = course_setup
        assert api(s1).get(f"/api/course/semester-courses/{sc.id}/attendance-report/").status_code == 403

    def test_student_summary_is_own_only(self, course_setup):
        _, s1, _ = course_setup
        data = api(s1).get("/api/course/semester-courses/my-attendance-summary/").json()
        assert len(data) == 1
        assert data[0]["present"] == 2 and data[0]["absent"] == 1 and data[0]["percentage"] == 66.7

    def test_no_sessions_held_gives_zero(self):
        course = Course.objects.create(title="Empty", batch_year=1)
        sc = SemesterCourse.objects.create(course=course, academic_year=2026, semester=1, status="OPEN")
        s = make_user("x@finot.test")
        CourseEnrollment.objects.create(semester_course=sc, student=s)
        data = api(s).get("/api/course/semester-courses/my-attendance-summary/").json()
        assert data[0]["percentage"] == 0.0 and data[0]["sessions_held"] == 0


import pytest  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from model_bakery import baker  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from core.models import Role, UserRole  # noqa: E402
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse  # noqa: E402


def _user(email, role=None):
    User = get_user_model()
    u = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=u, role=Role.objects.get_or_create(name=role)[0])
    return User.objects.get(pk=u.pk)


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.mark.django_db
class TestClassDays:
    def setup_method(self):
        self.coord = _user("c@x.test", Role.COURSE_COORDINATOR)
        self.student = _user("s@x.test")
        self.sc = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1)
        self.sc.coordinators.add(self.coord)
        self.url = "/api/course/sessions/bulk/"

    def test_coordinator_creates_the_picked_days_and_repeats_are_skipped(self):
        c = _client(self.coord)
        body = {"semester_course": str(self.sc.id), "dates": ["2026-10-06", "2026-10-08", "2026-10-13"], "teacher_name": "Abba T"}
        first = c.post(self.url, body, format="json")
        assert first.status_code == 201 and first.json()["created"] == 3 and first.json()["skipped"] == []
        again = c.post(self.url, {**body, "dates": ["2026-10-08", "2026-10-15"]}, format="json").json()
        assert again["created"] == 1 and again["skipped"] == ["2026-10-08"]
        assert CourseSession.objects.filter(semester_course=self.sc).count() == 4
        assert CourseSession.objects.get(semester_course=self.sc, date="2026-10-06").teacher_name == "Abba T"

    def test_bad_input_is_a_clear_error(self):
        c = _client(self.coord)
        assert c.post(self.url, {"semester_course": str(self.sc.id), "dates": ["not-a-date"]}, format="json").status_code == 400
        assert c.post(self.url, {"semester_course": str(self.sc.id), "dates": []}, format="json").status_code == 400
        assert c.post(self.url, {"semester_course": "nope", "dates": ["2026-10-06"]}, format="json").status_code == 404

    def test_students_cannot_create_days(self):
        res = _client(self.student).post(self.url, {"semester_course": str(self.sc.id), "dates": ["2026-10-06"]}, format="json")
        assert res.status_code == 403

    def test_a_day_can_be_moved_and_deleted_and_reports_marked_students(self):
        c = _client(self.coord)
        c.post(self.url, {"semester_course": str(self.sc.id), "dates": ["2026-10-06"]}, format="json")
        day = CourseSession.objects.get(semester_course=self.sc)
        CourseEnrollment.objects.create(semester_course=self.sc, student=self.student)
        AttendanceRecord.objects.create(session=day, student=self.student, status="PRESENT", marked_by=self.coord)
        listed = c.get(f"/api/course/sessions/?semester_course={self.sc.id}").json()
        rows = listed["results"] if isinstance(listed, dict) else listed
        assert rows[0]["marked_count"] == 1
        moved = c.patch(f"/api/course/sessions/{day.id}/", {"date": "2026-10-09"}, format="json")
        assert moved.status_code == 200 and moved.json()["date"] == "2026-10-09"
        assert c.delete(f"/api/course/sessions/{day.id}/").status_code == 204
        assert not CourseSession.objects.filter(pk=day.id).exists()


@pytest.mark.django_db
class TestMarkAttendance:
    def setup_method(self):
        self.coord = _user("c2@x.test", Role.COURSE_COORDINATOR)
        self.s1, self.s2 = _user("s1@x.test"), _user("s2@x.test")
        self.sc = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1, status="OPEN")
        self.sc.coordinators.add(self.coord)
        self.day = CourseSession.objects.create(semester_course=self.sc, date="2026-10-06")
        for s in (self.s1, self.s2):
            CourseEnrollment.objects.get_or_create(semester_course=self.sc, student=s)
        self.c = _client(self.coord)
        self.url = f"/api/course/attendance/bulk-mark/{self.day.id}/"

    def mark(self, s1="PRESENT", s2="PRESENT"):
        records = [{"student_id": self.s1.id, "status": s1}, {"student_id": self.s2.id, "status": s2}]
        return self.c.post(self.url, {"records": records}, format="json")

    def test_present_and_absent_are_saved_and_changed(self):
        assert self.mark(s1="ABSENT").status_code == 200
        assert AttendanceRecord.objects.get(session=self.day, student=self.s1).status == "ABSENT"
        out = self.mark(s1="PRESENT").json()
        assert out["updated"] == 1 and AttendanceRecord.objects.get(session=self.day, student=self.s1).status == "PRESENT"

    def test_only_present_or_absent_exist(self):
        assert self.mark(s1="LATE").status_code == 400

    def test_roster_shows_the_saved_status(self):
        self.mark(s2="ABSENT")
        roster = {r["student_id"]: r for r in self.c.get(f"/api/course/sessions/{self.day.id}/roster/").json()["roster"]}
        assert roster[self.s1.id]["status"] == "PRESENT" and roster[self.s2.id]["status"] == "ABSENT"
        assert "remarks" not in roster[self.s1.id]

    def test_report_has_every_class_day_for_every_student(self):
        second = CourseSession.objects.create(semester_course=self.sc, date="2026-10-08")  # never marked
        self.mark(s2="ABSENT")
        rep = self.c.get(f"/api/course/semester-courses/{self.sc.id}/attendance-report/").json()
        assert [d["marked"] for d in rep["sessions"]] == [True, False]
        assert rep["sessions"][1]["id"] == str(second.id) and rep["batch_year"] == 1 and rep["status"] == "OPEN"
        rows = {r["username"]: r for r in rep["students"]}
        assert rows["s1@x.test"]["days"] == {str(self.day.id): "PRESENT"}
        assert rows["s2@x.test"]["days"] == {str(self.day.id): "ABSENT"} and rows["s2@x.test"]["percentage"] == 0.0

    def test_student_sees_their_own_status(self):
        self.mark(s1="ABSENT")
        rows = _client(self.s1).get("/api/course/attendance/").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        assert rows[0]["status"] == "ABSENT" and "remarks" not in rows[0]
