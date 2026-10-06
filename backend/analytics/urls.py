from django.urls import path

from .api_views import (
    CourseAttendanceExportView,
    EventAttendanceExportView,
    EventsExportView,
    FamiliesExportView,
    DonationsExportView,
    PrivateQAExportView,
    StudentsExportView,
)

urlpatterns = [
    path("export/students/", StudentsExportView.as_view(), name="export-students"),
    path("export/families/", FamiliesExportView.as_view(), name="export-families"),
    path("export/donations/", DonationsExportView.as_view(), name="export-donations"),
    path("export/private-qa/", PrivateQAExportView.as_view(), name="export-private-qa"),
    path("export/events/", EventsExportView.as_view(), name="export-events"),
    path("export/event-attendance/", EventAttendanceExportView.as_view(), name="export-event-attendance"),
    path(
        "export/course-attendance/<uuid:semester_course_id>/",
        CourseAttendanceExportView.as_view(),
        name="export-course-attendance",
    ),
]
