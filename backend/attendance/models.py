"""
Smart attendance: a "session" is the time window in which an organizer takes attendance for ONE target,
either an event (general or group) or a course class day.

While the session is open, students are marked Present by:
  * a badge scan   (the organizer or a helper scans the student's personal QR badge),
  * a 6-digit code (the student types the rotating room code on their own phone),
  * manual marking (the existing attendance pages still work).
When it is closed, everyone on the roster without a record becomes Absent.

The Present/Absent rows are written into the SAME tables as before (service.ServiceAttendance for events,
course.AttendanceRecord for class days), so reports, exports and the student history keep working.
CheckIn is only the audit trail: who was scanned by whom, how and when.
"""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AttendanceSession(models.Model):
    OPEN = "OPEN"
    CLOSED = "CLOSED"

    event = models.ForeignKey(
        "service.Event", on_delete=models.CASCADE, null=True, blank=True, related_name="attendance_sessions",
    )
    course_session = models.ForeignKey(
        "course.CourseSession", on_delete=models.CASCADE, null=True, blank=True, related_name="attendance_sessions",
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="opened_attendance_sessions",
    )
    opened_at = models.DateTimeField(default=timezone.now)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="closed_attendance_sessions",
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    auto_close_at = models.DateTimeField(
        help_text="A forgotten session is closed by the server at this moment (event end + 2 h, or end of the class day).",
    )
    helpers = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="helped_attendance_sessions",
        help_text="People allowed to scan badges for this session besides the organizer.",
    )

    class Meta:
        ordering = ["-opened_at"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(event__isnull=False, course_session__isnull=True)
                           | Q(event__isnull=True, course_session__isnull=False)),
                name="attendance_session_has_one_target",
            ),
            # Only one OPEN session per target (closed ones keep their history).
            models.UniqueConstraint(fields=["event"], condition=Q(closed_at__isnull=True), name="one_open_session_per_event"),
            models.UniqueConstraint(fields=["course_session"], condition=Q(closed_at__isnull=True),
                                    name="one_open_session_per_class_day"),
        ]

    def __str__(self):
        return f"Attendance for {self.target} ({self.status})"

    @property
    def target(self):
        return self.event if self.event_id else self.course_session

    @property
    def kind(self):
        return "event" if self.event_id else "class_day"

    @property
    def is_open(self):
        return self.closed_at is None

    @property
    def status(self):
        return self.OPEN if self.is_open else self.CLOSED

    @staticmethod
    def default_auto_close(event=None, course_session=None):
        """Event: two hours after its end. Class day: 21:00 Ethiopian time (18:00 UTC) on that date."""
        if event is not None:
            return event.end_date + timedelta(hours=2)
        from datetime import datetime, time, timezone as dt_timezone

        return datetime.combine(course_session.date, time(18, 0), tzinfo=dt_timezone.utc)


class CheckIn(models.Model):
    BADGE = "BADGE"
    CODE = "CODE"
    MANUAL = "MANUAL"
    METHOD_CHOICES = [(BADGE, "Badge scan"), (CODE, "6-digit code"), (MANUAL, "Manual")]

    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name="check_ins")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="check_ins")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    scanned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="scans_made",
    )
    scanned_at = models.DateTimeField(help_text="When the scan happened on the phone (may be earlier than received_at when synced later).")
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["session", "student"], name="one_check_in_per_student_per_session")]
        ordering = ["scanned_at"]

    def __str__(self):
        return f"{self.student} checked in ({self.method})"
