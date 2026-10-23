import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker

from course.models import Course, CourseEnrollment, SemesterCourse
from student.models import StudentProfile

User = get_user_model()


def student(email, batch, status=StudentProfile.IN_CAMPUS, active=True):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T", is_active=active)
    p = StudentProfile.objects.get(user=user)
    p.batch_year = batch
    p.status = status
    p.save()
    return User.objects.get(pk=user.pk)


def enrolled(sc):
    return set(CourseEnrollment.objects.filter(semester_course=sc).values_list("student__email", flat=True))


@pytest.mark.django_db
class TestOpeningACourse:
    def test_students_of_that_year_are_enrolled_automatically(self):
        a, b = student("a@x.test", 1), student("b@x.test", 1)
        student("c@x.test", 2)  # other year
        student("g@x.test", 1, status=StudentProfile.GRADUATED)
        student("off@x.test", 1, active=False)
        sc = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1)
        assert enrolled(sc) == {"a@x.test", "b@x.test"}

    def test_students_without_a_year_are_left_out(self):
        student("n@x.test", None)
        sc = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1)
        assert enrolled(sc) == set()


@pytest.mark.django_db
class TestStudentChangingYear:
    def test_setting_the_year_enrols_in_the_latest_course_of_that_year(self):
        course = baker.make(Course, batch_year=1)
        old = baker.make(SemesterCourse, course=course, academic_year=2025, semester=2)
        new = baker.make(SemesterCourse, course=course, academic_year=2026, semester=1)
        late = student("late@x.test", None)
        assert enrolled(new) == set()
        p = StudentProfile.objects.get(user=late)
        p.batch_year = 1
        p.save()
        assert enrolled(new) == {"late@x.test"} and enrolled(old) == set()  # only the current run

    def test_moving_up_adds_the_next_course_and_leaves_the_old_one_unless_attendance_was_taken(self):
        from datetime import date

        from .models import AttendanceRecord, CourseSession

        first = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1)
        second = baker.make(SemesterCourse, course=baker.make(Course, batch_year=2), academic_year=2026, semester=1)
        s = student("s@x.test", 1)
        t = student("t@x.test", 1)
        assert enrolled(first) == {"s@x.test", "t@x.test"}
        day = CourseSession.objects.create(semester_course=first, date=date(2026, 1, 5))
        AttendanceRecord.objects.create(session=day, student=t, status="PRESENT")  # t has history in the old course
        for u in (s, t):
            p = StudentProfile.objects.get(user=u)
            p.batch_year = 2
            p.save()
        assert enrolled(second) == {"s@x.test", "t@x.test"}
        assert enrolled(first) == {"t@x.test"}  # a wrong year is corrected; real history stays

    def test_the_yearly_rollover_enrols_the_new_year(self):
        from student import rollover
        sc2 = baker.make(SemesterCourse, course=baker.make(Course, batch_year=2), academic_year=2026, semester=1)
        s = student("s@x.test", 1)
        boss = student("boss@x.test", None)
        rollover.apply_rollover(boss, label="2026/27")
        assert enrolled(sc2) == {"s@x.test"}

    def test_graduates_and_inactive_curricula_are_not_enrolled(self):
        inactive = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1, is_active=False), academic_year=2026, semester=1)
        student("s@x.test", 1)
        p = StudentProfile.objects.get(user=User.objects.get(email="s@x.test"))
        p.batch_year = 1
        p.save()
        assert enrolled(inactive) == set()  # an inactive curriculum never enrols anyone
        live = baker.make(SemesterCourse, course=baker.make(Course, batch_year=3), academic_year=2026, semester=1)
        g = student("g@x.test", 3, status=StudentProfile.GRADUATED)
        assert enrolled(live) == set()

    def test_no_duplicates_when_saved_again(self):
        sc = baker.make(SemesterCourse, course=baker.make(Course, batch_year=1), academic_year=2026, semester=1)
        s = student("s@x.test", 1)
        for _ in range(3):
            p = StudentProfile.objects.get(user=s)
            p.telegram_username = "x"
            p.save()
        assert CourseEnrollment.objects.filter(semester_course=sc).count() == 1


@pytest.mark.django_db
class TestStudentSeesTheirCourses:
    def test_a_first_year_student_gets_the_course_without_any_button(self):
        from rest_framework.test import APIClient
        s = student("s@x.test", 1)
        baker.make(SemesterCourse, course=baker.make(Course, batch_year=1, title="Doctrine"), academic_year=2026, semester=1, status="OPEN")
        baker.make(SemesterCourse, course=baker.make(Course, batch_year=2, title="Saints"), academic_year=2026, semester=1, status="OPEN")
        c = APIClient()
        c.force_authenticate(s)
        rows = c.get("/api/course/semester-courses/").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        assert [r["course_details"]["title"] for r in rows] == ["Doctrine"] and rows[0]["enrollment_count"] == 1
