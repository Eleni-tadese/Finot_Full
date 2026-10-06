import datetime
import io

import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from openpyxl import load_workbook
from rest_framework.test import APIClient

from analytics.utils.xlsx import Sheet, build_workbook
from core.models import Role, UserRole
from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse
from service.models import Event, Family, FamilyMembership, ServiceAttendance

User = get_user_model()


def make_user(email, role_name=None):
    user = User.objects.create_user(
        username=email, email=email, password="Pass@12345", first_name=email.split("@")[0], last_name="T"
    )
    if role_name:
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.create(user=user, role=role)
    return user


def get(user, url):
    client = APIClient()
    client.force_authenticate(user)
    return client.get(url)


def sheet_rows(response, sheet_index=0):
    wb = load_workbook(io.BytesIO(response.content))
    return [list(r) for r in wb.worksheets[sheet_index].iter_rows(values_only=True)]


class TestXlsxHelper:
    def test_formula_text_is_neutralised(self):
        wb = build_workbook([Sheet("S", ["A"], [["=HYPERLINK(\"x\")"], ["+1"], ["normal"], [None]])])
        values = [c[0].value for c in wb["S"].iter_rows(min_row=2)]
        assert values[:3] == ["'=HYPERLINK(\"x\")", "'+1", "normal"]

    def test_long_title_is_cut_to_excel_limit(self):
        wb = build_workbook([Sheet("x" * 50, ["A"], [])])
        assert len(wb.sheetnames[0]) == 31


@pytest.mark.django_db
class TestExportPermissions:
    URLS = [
        "/api/analytics/export/students/",
        "/api/analytics/export/families/",
        "/api/analytics/export/events/",
        "/api/analytics/export/event-attendance/",
    ]

    def test_anonymous_and_student_denied(self):
        student = make_user("stu@finot.test")
        for url in self.URLS:
            assert APIClient().get(url).status_code == 401
            assert get(student, url).status_code == 403

    def test_service_admin_cannot_export_students_or_families(self):
        admin = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        assert get(admin, "/api/analytics/export/students/").status_code == 403
        assert get(admin, "/api/analytics/export/families/").status_code == 403

    def test_superuser_gets_xlsx_for_all(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        for url in self.URLS:
            res = get(boss, url)
            assert res.status_code == 200
            assert "spreadsheetml" in res["Content-Type"]
            assert ".xlsx" in res["Content-Disposition"]


@pytest.mark.django_db
class TestExportContents:
    def test_students_sheet(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        make_user("stu@finot.test")
        rows = sheet_rows(get(boss, "/api/analytics/export/students/"))
        assert rows[0][0] == "Full name"
        assert any(r[2] == "stu@finot.test" for r in rows[1:])

    def test_families_have_members_sheet(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        fam = baker.make(Family, name="Fam A", father=None, mother=None)
        FamilyMembership.objects.create(family=fam, student=make_user("m@finot.test"))
        res = get(boss, "/api/analytics/export/families/")
        assert sheet_rows(res, 0)[1][0] == "Fam A" and sheet_rows(res, 0)[1][5] == 1
        assert sheet_rows(res, 1)[1][2] == "m@finot.test"

    def test_event_manager_exports_only_own_events(self):
        em = make_user("em@finot.test", Role.EVENT_MANAGER)
        other = make_user("em2@finot.test", Role.EVENT_MANAGER)
        baker.make(Event, created_by=em, title="Mine", service_group=None)
        baker.make(Event, created_by=other, title="Theirs", service_group=None)
        titles = [r[0] for r in sheet_rows(get(em, "/api/analytics/export/events/"))[1:]]
        assert titles == ["Mine"]

    def test_service_admin_attendance_limited_to_own_group(self):
        sa = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        from service.models import ServiceGroup
        mine = baker.make(ServiceGroup, admin=sa)
        theirs = baker.make(ServiceGroup)
        stu = make_user("stu@finot.test")
        e1 = baker.make(Event, service_group=mine, title="E1")
        e2 = baker.make(Event, service_group=theirs, title="E2")
        for e in (e1, e2):
            ServiceAttendance.objects.create(event=e, student=stu, status="PRESENT")
        rows = sheet_rows(get(sa, "/api/analytics/export/event-attendance/"))[1:]
        assert [r[0] for r in rows] == ["E1"]

    def test_course_attendance_export(self):
        coord = make_user("c@finot.test", Role.COURSE_COORDINATOR)
        sc = SemesterCourse.objects.create(course=Course.objects.create(title="Doc", batch_year=1), academic_year=2026, semester=1)
        sc.coordinators.add(coord)
        stu = make_user("stu@finot.test")
        CourseEnrollment.objects.create(semester_course=sc, student=stu)
        session = CourseSession.objects.create(semester_course=sc, date=datetime.date(2026, 1, 1))
        AttendanceRecord.objects.create(session=session, student=stu, status="PRESENT")
        res = get(coord, f"/api/analytics/export/course-attendance/{sc.id}/")
        assert sheet_rows(res, 0)[1][5] == 100.0
        by_day = sheet_rows(res, 1)
        assert by_day[0] == ["Student", "Username", "2026-01-01"] and by_day[1][1:] == ["stu@finot.test", "P"]
        summary = dict(sheet_rows(res, 2)[1:])
        assert summary["Course"] == "Doc" and summary["Batch"] == 1 and summary["Class days held"] == 1
        assert get(stu, f"/api/analytics/export/course-attendance/{sc.id}/").status_code == 403


@pytest.mark.django_db
class TestAdminReportsPage:
    def _client(self, user):
        from django.test import Client
        c = Client()
        c.force_login(user)
        return c

    def test_service_admin_blocked_from_reports_page(self):
        sa = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        assert sa.is_staff and not sa.is_superuser
        c = self._client(sa)
        assert c.get("/admin/reports-and-exports/").status_code == 403
        assert c.post("/admin/reports-and-exports/", {"format": "xlsx"}).status_code == 403

    def test_superuser_downloads_xlsx(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        make_user("stu@finot.test")
        c = self._client(boss)
        res = c.post("/admin/reports-and-exports/", {"format": "xlsx"})
        assert res.status_code == 200 and "spreadsheetml" in res["Content-Type"]
        assert c.get("/admin/reports-and-exports/?xlsx=families").status_code == 200
        assert c.get("/admin/reports-and-exports/").status_code == 200
