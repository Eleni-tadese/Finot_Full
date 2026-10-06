"""Not started / Open / Completed: the coordinator runs the life of a course."""
import datetime

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Role, UserRole
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse
from notifications.class_reminders import send_class_reminders

User = get_user_model()


def _user(email, role=None):
    u = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=u, role=Role.objects.get_or_create(name=role)[0])
    return User.objects.get(pk=u.pk)


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _rows(res):
    body = res.json()
    return body["results"] if isinstance(body, dict) else body


@pytest.mark.django_db
class TestCourseStatus:
    def setup_method(self):
        self.coord = _user("a@x.test", Role.COURSE_COORDINATOR)
        self.other = _user("b@x.test", Role.COURSE_COORDINATOR)
        self.stu = _user("s@x.test")
        self.sc = SemesterCourse.objects.create(course=Course.objects.create(title="Doctrine", batch_year=1), academic_year=2026, semester=1)
        self.sc.coordinators.add(self.coord)
        CourseEnrollment.objects.create(semester_course=self.sc, student=self.stu)
        self.day = CourseSession.objects.create(semester_course=self.sc, date="2026-10-06")
        self.url = f"/api/course/semester-courses/{self.sc.id}/set-status/"

    def set(self, user, status):
        return _client(user).post(self.url, {"status": status}, format="json")

    def test_new_course_starts_as_not_started_and_students_do_not_see_it(self):
        assert self.sc.status == "PLANNED"
        assert _rows(_client(self.stu).get("/api/course/semester-courses/")) == []
        assert _rows(_client(self.stu).get("/api/course/sessions/")) == []
        assert _rows(_client(self.stu).get("/api/course/semester-courses/my-attendance-summary/")) == []
        assert len(_rows(_client(self.coord).get("/api/course/semester-courses/"))) == 1

    def test_coordinator_starts_it_and_students_see_it(self):
        res = self.set(self.coord, "OPEN")
        assert res.status_code == 200 and res.json()["status"] == "OPEN"
        rows = _rows(_client(self.stu).get("/api/course/semester-courses/"))
        assert [r["status"] for r in rows] == ["OPEN"]

    def test_only_the_named_coordinator_can_change_it(self):
        assert self.set(self.stu, "OPEN").status_code == 403
        assert self.set(self.other, "OPEN").status_code in (403, 404)
        assert self.set(self.coord, "nonsense").status_code == 400
        self.sc.refresh_from_db()
        assert self.sc.status == "PLANNED"

    def test_completed_keeps_everything_for_the_student_but_freezes_changes(self):
        self.set(self.coord, "OPEN")
        c = _client(self.coord)
        body = {"records": [{"student_id": self.stu.id, "status": "ABSENT"}]}
        assert c.post(f"/api/course/attendance/bulk-mark/{self.day.id}/", body, format="json").status_code == 200
        assert self.set(self.coord, "COMPLETED").status_code == 200

        # the student still sees the course, the days, the attendance and the summary
        s = _client(self.stu)
        assert [r["status"] for r in _rows(s.get("/api/course/semester-courses/"))] == ["COMPLETED"]
        assert len(_rows(s.get("/api/course/sessions/"))) == 1
        assert _rows(s.get("/api/course/attendance/"))[0]["status"] == "ABSENT"
        summary = _rows(s.get("/api/course/semester-courses/my-attendance-summary/"))
        assert summary[0]["status"] == "COMPLETED" and summary[0]["absent"] == 1

        # the coordinator can no longer change days or attendance...
        assert c.post(f"/api/course/attendance/bulk-mark/{self.day.id}/", body, format="json").status_code == 400
        assert c.post("/api/course/sessions/bulk/", {"semester_course": str(self.sc.id), "dates": ["2026-10-08"]}, format="json").status_code == 400
        assert c.delete(f"/api/course/sessions/{self.day.id}/").status_code == 400
        assert CourseSession.objects.filter(pk=self.day.id).exists()
        # ...but can still read the report, and can reopen
        assert c.get(f"/api/course/semester-courses/{self.sc.id}/attendance-report/").status_code == 200
        assert self.set(self.coord, "OPEN").status_code == 200
        assert c.post(f"/api/course/attendance/bulk-mark/{self.day.id}/", body, format="json").status_code == 200

    def test_class_reminders_only_for_open_courses(self):
        tomorrow = datetime.date(2026, 10, 5)
        for status, expected in (("PLANNED", 0), ("COMPLETED", 0), ("OPEN", 1)):
            SemesterCourse.objects.filter(pk=self.sc.pk).update(status=status)
            CourseSession.objects.filter(pk=self.day.pk).update(reminder_sent_at=None)
            assert send_class_reminders(today=tomorrow)["sessions"] == expected, status


@pytest.mark.django_db
def test_changing_a_curriculums_batch_enrols_that_batch_in_its_running_course():
    from student.models import StudentProfile
    first_year = _user("f@x.test")
    StudentProfile.objects.update_or_create(user=first_year, defaults={"batch_year": 1, "status": StudentProfile.IN_CAMPUS})
    course = Course.objects.create(title="Saints", batch_year=2)
    sc = SemesterCourse.objects.create(course=course, academic_year=2026, semester=1, status="OPEN")
    assert not sc.enrollments.filter(student=first_year).exists()
    course.batch_year = 1
    course.save()
    assert sc.enrollments.filter(student=first_year).exists()
