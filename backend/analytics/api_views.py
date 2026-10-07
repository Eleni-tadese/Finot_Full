"""
Excel (.xlsx) export endpoints. Every endpoint checks permissions on the server,
because the files contain personal data.

    GET /api/analytics/export/students/                         Super Admin
    GET /api/analytics/export/families/                         Super Admin, Family Admin
    GET /api/analytics/export/events/                           Super Admin (all), Event Manager (own)
    GET /api/analytics/export/event-attendance/[?event=<id>]    Super Admin (all), Service Admin (own group)
    GET /api/analytics/export/private-qa/                       Super Admin
    GET /api/analytics/export/donations/[?status=&fund=&kind=&search=&date_from=&date_to=]   Super Admin
    GET /api/analytics/export/course-attendance/<semester_course_id>/   Super Admin, Course Coordinator
"""
import datetime

from django.db.models import Q

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.models import Role
from course.models import SemesterCourse
from course.reports import course_attendance_report
from service.models import Event, ServiceAttendance

from . import exports
from .exports import (
    donations_sheets, event_attendance_sheets, events_sheets, families_sheets, private_qa_sheets, students_sheets,
)
from .utils.xlsx import Sheet, xlsx_response


def _has_role(user, *role_names):
    return user.is_superuser or user.roles.filter(name__in=role_names).exists()


def _stamp():
    return datetime.date.today().isoformat()


class ExportView(APIView):
    permission_classes = [IsAuthenticated]


class StudentsExportView(ExportView):
    def get(self, request):
        if not _has_role(request.user, Role.SUPER_ADMIN):
            raise PermissionDenied("Only the Super Admin can export students.")
        return xlsx_response(f"students-{_stamp()}.xlsx", students_sheets())


class FamiliesExportView(ExportView):
    def get(self, request):
        if not _has_role(request.user, Role.SUPER_ADMIN, Role.FAMILY_ADMIN):
            raise PermissionDenied("Not allowed to export families.")
        return xlsx_response(f"families-{_stamp()}.xlsx", families_sheets())


def _super_admin_export(slug, builder):
    """A view class for a Super Admin only export (these files hold personal data)."""
    class View(ExportView):
        def get(self, request):
            if not _has_role(request.user, Role.SUPER_ADMIN):
                raise PermissionDenied("Only the Super Admin can export this.")
            return xlsx_response(f"{slug}-{_stamp()}.xlsx", getattr(exports, builder)())
    View.__name__ = f"{builder}_view"
    return View


EXTRA_EXPORTS = {
    "users": "users_sheets",
    "service-groups": "service_groups_sheets",
    "courses": "courses_sheets",
    "public-qa": "public_qa_sheets",
    "materials": "materials_sheets",
    "setup": "setup_sheets",
    "sms-log": "sms_log_sheets",
    "everything": "everything_sheets",
}
EXTRA_EXPORT_VIEWS = {slug: _super_admin_export(slug, b) for slug, b in EXTRA_EXPORTS.items()}


class DonationsExportView(ExportView):
    def get(self, request):
        if not _has_role(request.user, Role.SUPER_ADMIN):
            raise PermissionDenied("Only the Super Admin can export donations.")
        return xlsx_response(f"donations-{_stamp()}.xlsx", donations_sheets(request.query_params))


class PrivateQAExportView(ExportView):
    def get(self, request):
        if not _has_role(request.user, Role.SUPER_ADMIN):
            raise PermissionDenied("Only the Super Admin can export private questions.")
        return xlsx_response(f"private-qa-{_stamp()}.xlsx", private_qa_sheets())


class EventsExportView(ExportView):
    def get(self, request):
        user = request.user
        if _has_role(user, Role.SUPER_ADMIN):
            events = Event.objects.all()
        elif _has_role(user, Role.EVENT_MANAGER):
            events = Event.objects.filter(created_by=user)
        else:
            raise PermissionDenied("Not allowed to export events.")
        return xlsx_response(f"events-{_stamp()}.xlsx", events_sheets(events))


class EventAttendanceExportView(ExportView):
    def get(self, request):
        user = request.user
        records = ServiceAttendance.objects.all()
        if not _has_role(user, Role.SUPER_ADMIN):
            # a Service Admin gets their group's events, an Event Manager the general events they made
            allowed = None
            if _has_role(user, Role.SERVICE_ADMIN):
                allowed = Q(event__service_group__in=user.managed_service_groups.all())
            if _has_role(user, Role.EVENT_MANAGER):
                own = Q(event__service_group__isnull=True, event__created_by=user)
                allowed = own if allowed is None else (allowed | own)
            if allowed is None:
                raise PermissionDenied("Not allowed to export attendance.")
            records = records.filter(allowed)
        event_id = request.query_params.get("event")
        if event_id:
            if not event_id.isdigit():
                raise ValidationError({"event": "Must be a number."})
            records = records.filter(event_id=event_id)
        return xlsx_response(f"event-attendance-{_stamp()}.xlsx", event_attendance_sheets(records))


class CourseAttendanceExportView(ExportView):
    def get(self, request, semester_course_id):
        semester_course = get_object_or_404(SemesterCourse.objects.select_related("course"), pk=semester_course_id)
        from course.access import can_manage_semester_course
        if not can_manage_semester_course(request.user, semester_course):
            raise PermissionDenied("Not allowed to export this course's attendance.")
        report = course_attendance_report(semester_course)

        def full_name(s):
            return " ".join(p for p in (s["first_name"], s["middle_name"], s["last_name"]) if p) or s["username"]

        headers = ["Student", "Username", "Present", "Absent", "Not marked", "Attendance %"]
        rows = [
            [full_name(s), s["username"], s["present"], s["absent"], s["unmarked"], s["percentage"]]
            for s in report["students"]
        ]
        # one column per class day: P = present, A = absent, empty = not marked
        marked_days = [d for d in report["sessions"] if d["marked"]]
        day_headers = ["Student", "Username"] + [d["date"] for d in marked_days]
        mark = {"PRESENT": "P", "ABSENT": "A"}
        day_rows = [
            [full_name(s), s["username"]] + [mark.get(s["days"].get(d["id"]), "") for d in marked_days]
            for s in report["students"]
        ]
        semester = "First semester" if report["semester"] == 1 else "Second semester"
        summary = [
            ["Course", report["course_title"]],
            ["Batch", report["batch_year"]],
            ["Academic year", report["academic_year"]],
            ["Semester", semester],
            ["Status", {"PLANNED": "Not started", "OPEN": "Open", "COMPLETED": "Completed"}.get(report["status"], report["status"])],
            ["Students enrolled", report["student_count"]],
            ["Class days held", report["sessions_held"]],
            ["Class days planned", report["sessions_total"]],
            ["Average attendance %", report["average_percentage"]],
        ]
        return xlsx_response(f"course-attendance-{_stamp()}.xlsx", [
            Sheet("Report", headers, rows),
            Sheet("By class day", day_headers, day_rows),
            Sheet("Summary", ["Item", "Value"], summary),
        ])
