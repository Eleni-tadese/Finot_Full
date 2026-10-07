import io

import pytest
from model_bakery import baker
from openpyxl import load_workbook

from analytics.api_views import EXTRA_EXPORTS
from analytics.tests import get, make_user
from core.models import Role
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse
from questionanswer.models import Answer, Question
from service.models import ServiceGroup, ServiceGroupMembership
from student.models import Department, StudentProfile


def sheets(response):
    wb = load_workbook(io.BytesIO(response.content))
    return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}


@pytest.mark.django_db
class TestAllTablesExport:
    def _fill(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        stu = make_user("stu@finot.test")
        StudentProfile.objects.update_or_create(user=stu, defaults={"batch_year": 1, "department": "Law"})
        Department.objects.create(name="Law", years=4)
        group = ServiceGroup.objects.create(name="Choir", admin=stu)
        ServiceGroupMembership.objects.create(student=stu, service_group=group)
        course = Course.objects.create(title="Doctrine", batch_year=1)
        sc = SemesterCourse.objects.create(course=course, academic_year=2026, semester=1)
        CourseEnrollment.objects.get_or_create(semester_course=sc, student=stu)
        day = CourseSession.objects.create(semester_course=sc, date="2026-10-12", topic="Intro")
        AttendanceRecord.objects.create(session=day, student=stu, status="PRESENT", marked_by=boss)
        q = Question.objects.create(
            user=stu, display_name="Nick", category=Question.CATEGORY_CHOICES[0][0], question_body="Why?",
            visibility=Question.VISIBILITY_PUBLIC, is_approved=True,
        )
        Answer.objects.create(question=q, responder=boss, display_name="Boss", answer_body="Because", is_approved=True)
        return boss, stu

    def test_every_export_works_and_is_super_admin_only(self):
        boss, stu = self._fill()
        for slug in EXTRA_EXPORTS:
            url = f"/api/analytics/export/{slug}/"
            assert get(boss, url).status_code == 200, slug
            assert get(stu, url).status_code == 403, slug

    def test_contents(self):
        boss, stu = self._fill()
        users = sheets(get(boss, "/api/analytics/export/users/"))["Users and roles"]
        assert users[0][1] == "Email (login)" and any("stu@finot.test" in r for r in users)
        assert "password" not in " ".join(str(c).lower() for c in users[0])
        courses = sheets(get(boss, "/api/analytics/export/courses/"))
        assert courses["Course attendance"][1][4] == "PRESENT"
        assert courses["Enrolments"][1][4] == "stu@finot.test"
        groups = sheets(get(boss, "/api/analytics/export/service-groups/"))
        assert groups["Members"][1][0] == "Choir"
        assert sheets(get(boss, "/api/analytics/export/public-qa/"))["Public Q&A"][1][6] == "Because"

    def test_everything_workbook_has_unique_sheets(self):
        boss, _ = self._fill()
        names = list(sheets(get(boss, "/api/analytics/export/everything/")))
        assert len(names) == len(set(names)) and "Users and roles" in names and "Course attendance" in names
