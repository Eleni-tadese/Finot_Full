"""A Course Coordinator manages only the semester courses where they are named."""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Role, UserRole
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse
from resources.models import Material

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
class TestCoordinatorScope:
    def setup_method(self):
        self.mine_coord = _user("a@x.test", Role.COURSE_COORDINATOR)
        self.other_coord = _user("b@x.test", Role.COURSE_COORDINATOR)
        self.boss = _user("boss@x.test", Role.SUPER_ADMIN)
        self.stu = _user("s@x.test")
        self.mine = SemesterCourse.objects.create(course=Course.objects.create(title="Mine", batch_year=1), academic_year=2026, semester=1, status="OPEN")
        self.theirs = SemesterCourse.objects.create(course=Course.objects.create(title="Theirs", batch_year=2), academic_year=2026, semester=1, status="OPEN")
        self.mine.coordinators.add(self.mine_coord)
        self.theirs.coordinators.add(self.other_coord)
        for sc in (self.mine, self.theirs):
            CourseEnrollment.objects.create(semester_course=sc, student=self.stu)
        self.day_mine = CourseSession.objects.create(semester_course=self.mine, date="2026-10-06")
        self.day_theirs = CourseSession.objects.create(semester_course=self.theirs, date="2026-10-06")

    def test_coordinator_lists_only_their_courses(self):
        rows = _rows(_client(self.mine_coord).get("/api/course/semester-courses/"))
        assert [r["id"] for r in rows] == [str(self.mine.id)]
        assert len(_rows(_client(self.boss).get("/api/course/semester-courses/"))) == 2

    def test_named_on_no_course_sees_nothing(self):
        nobody = _user("n@x.test", Role.COURSE_COORDINATOR)
        assert _rows(_client(nobody).get("/api/course/semester-courses/")) == []

    def test_report_only_for_own_course(self):
        c = _client(self.mine_coord)
        assert c.get(f"/api/course/semester-courses/{self.mine.id}/attendance-report/").status_code == 200
        assert c.get(f"/api/course/semester-courses/{self.theirs.id}/attendance-report/").status_code in (403, 404)

    def test_class_days_only_for_own_course(self):
        c = _client(self.mine_coord)
        ok = c.post("/api/course/sessions/bulk/", {"semester_course": str(self.mine.id), "dates": ["2026-10-08"]}, format="json")
        assert ok.status_code == 201
        no = c.post("/api/course/sessions/bulk/", {"semester_course": str(self.theirs.id), "dates": ["2026-10-08"]}, format="json")
        assert no.status_code == 403
        assert not CourseSession.objects.filter(semester_course=self.theirs, date="2026-10-08").exists()
        assert c.post("/api/course/sessions/", {"semester_course": str(self.theirs.id), "date": "2026-10-09"}, format="json").status_code == 403

    def test_cannot_see_edit_or_delete_another_courses_day(self):
        c = _client(self.mine_coord)
        assert [r["id"] for r in _rows(c.get("/api/course/sessions/"))] == [str(self.day_mine.id)]
        assert c.patch(f"/api/course/sessions/{self.day_theirs.id}/", {"date": "2026-10-20"}, format="json").status_code in (403, 404)
        assert c.delete(f"/api/course/sessions/{self.day_theirs.id}/").status_code in (403, 404)
        assert CourseSession.objects.filter(pk=self.day_theirs.id).exists()

    def test_attendance_only_for_own_course(self):
        c = _client(self.mine_coord)
        body = {"records": [{"student_id": self.stu.id, "status": "PRESENT"}]}
        assert c.post(f"/api/course/attendance/bulk-mark/{self.day_mine.id}/", body, format="json").status_code == 200
        assert c.post(f"/api/course/attendance/bulk-mark/{self.day_theirs.id}/", body, format="json").status_code == 403
        assert c.get(f"/api/course/sessions/{self.day_theirs.id}/roster/").status_code in (403, 404)
        assert not AttendanceRecord.objects.filter(session=self.day_theirs).exists()
        single = {"session": str(self.day_theirs.id), "student": str(self.stu.id), "status": "PRESENT"}
        assert c.post("/api/course/attendance/", single, format="json").status_code == 403

    def test_export_only_for_own_course(self):
        c = _client(self.mine_coord)
        assert c.get(f"/api/analytics/export/course-attendance/{self.mine.id}/").status_code == 200
        assert c.get(f"/api/analytics/export/course-attendance/{self.theirs.id}/").status_code == 403

    def test_super_admin_still_manages_everything(self):
        c = _client(self.boss)
        assert c.get(f"/api/course/semester-courses/{self.theirs.id}/attendance-report/").status_code == 200
        body = {"semester_course": str(self.theirs.id), "dates": ["2026-10-08"]}
        assert c.post("/api/course/sessions/bulk/", body, format="json").status_code == 201

    def test_materials_only_for_own_curriculum(self):
        c = _client(self.mine_coord)
        url = "/api/resources/materials/"
        ok = c.post(url, {"title": "T", "material_type": "COURSE", "course": str(self.mine.course_id), "url": "https://youtube.com/watch?v=1"}, format="multipart")
        assert ok.status_code == 201
        no = c.post(url, {"title": "T", "material_type": "COURSE", "course": str(self.theirs.course_id), "url": "https://youtube.com/watch?v=1"}, format="multipart")
        assert no.status_code == 400 and "course" in no.json()
        none = c.post(url, {"title": "T", "material_type": "COURSE", "url": "https://youtube.com/watch?v=1"}, format="multipart")
        assert none.status_code == 400
        other = Material.objects.create(title="O", material_type="COURSE", course=self.theirs.course, url="https://youtube.com/watch?v=2")
        assert c.delete(f"{url}{other.id}/").status_code in (403, 404)
        assert Material.objects.filter(pk=other.pk).exists()
        titles = {m["title"] for m in _rows(c.get(url))}
        assert "T" in titles and "O" not in titles


@pytest.mark.django_db
class TestMyCoursesIsOnlyWhatIStudy:
    def setup_method(self):
        from student.models import StudentProfile
        self.StudentProfile = StudentProfile
        self.coord = _user("k@x.test", Role.COURSE_COORDINATOR)
        self.first_year = _user("f@x.test")
        self.second_year = _user("g@x.test")
        for user, batch in ((self.coord, 4), (self.first_year, 1), (self.second_year, 2)):
            StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": batch, "status": StudentProfile.IN_CAMPUS})
        self.sc = SemesterCourse.objects.create(course=Course.objects.create(title="One", batch_year=1), academic_year=2026, semester=1, status="OPEN")
        self.sc.coordinators.add(self.coord)
        CourseEnrollment.objects.get_or_create(semester_course=self.sc, student=self.first_year)
        self.day = CourseSession.objects.create(semester_course=self.sc, date="2026-10-06")

    def mine(self, user):
        return _rows(_client(user).get("/api/course/semester-courses/?enrolled=1"))

    def test_a_coordinator_does_not_see_the_course_they_only_coordinate(self):
        assert self.mine(self.coord) == []
        assert len(_rows(_client(self.coord).get("/api/course/semester-courses/"))) == 1  # their coordinator list

    def test_student_sees_their_batch_course_but_not_another_batch(self):
        assert [r["id"] for r in self.mine(self.first_year)] == [str(self.sc.id)]
        CourseEnrollment.objects.get_or_create(semester_course=self.sc, student=self.second_year)  # a stale wrong-batch enrolment
        assert self.mine(self.second_year) == []
        assert _rows(_client(self.second_year).get("/api/course/semester-courses/my-attendance-summary/")) == []

    def test_a_completed_course_stays_as_history_after_the_student_moves_up(self):
        SemesterCourse.objects.filter(pk=self.sc.pk).update(status="COMPLETED")
        self.StudentProfile.objects.filter(user=self.first_year).update(batch_year=2)
        assert [r["status"] for r in self.mine(self.first_year)] == ["COMPLETED"]

    def test_mine_attendance_is_only_my_own_marks(self):
        CourseEnrollment.objects.get_or_create(semester_course=self.sc, student=self.coord)
        AttendanceRecord.objects.create(session=self.day, student=self.first_year, status="PRESENT")
        AttendanceRecord.objects.create(session=self.day, student=self.coord, status="ABSENT")
        c = _client(self.coord)
        assert len(_rows(c.get("/api/course/attendance/"))) == 2          # the coordinator's class list
        assert [r["status"] for r in _rows(c.get("/api/course/attendance/?mine=1"))] == ["ABSENT"]


@pytest.mark.django_db
def test_sync_command_adds_missing_and_removes_wrong_batch_but_keeps_marked():
    from django.core.management import call_command
    from student.models import StudentProfile
    right, wrong, marked = _user("r@x.test"), _user("w@x.test"), _user("m@x.test")
    for user, batch in ((right, 1), (wrong, 2), (marked, 2)):
        StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": batch, "status": StudentProfile.IN_CAMPUS})
    sc = SemesterCourse.objects.create(course=Course.objects.create(title="S", batch_year=1), academic_year=2026, semester=1, status="OPEN")
    CourseEnrollment.objects.filter(semester_course=sc).delete()
    for user in (wrong, marked):
        CourseEnrollment.objects.get_or_create(semester_course=sc, student=user)
    day = CourseSession.objects.create(semester_course=sc, date="2026-10-06")
    AttendanceRecord.objects.create(session=day, student=marked, status="PRESENT")
    call_command("sync_course_enrolments", verbosity=0)  # dry run changes nothing
    assert sc.enrollments.count() == 2
    call_command("sync_course_enrolments", "--yes", verbosity=0)
    assert set(sc.enrollments.values_list("student__username", flat=True)) == {"r@x.test", "m@x.test"}
