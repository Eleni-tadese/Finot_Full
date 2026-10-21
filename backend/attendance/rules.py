"""
Business rules of smart attendance, reusing the existing event and course rules.

  * Organizer: the person who may take attendance today (service.event_rules.can_manage_event_attendance for events,
    course.access.can_manage_semester_course for class days). Only an organizer opens, closes, reopens and names helpers.
  * Scanner: an organizer or a helper named on the session. Only they may scan badges and read the room code.
  * Roster: who should have been there (service.event_rules.attendance_roster, or the enrolled students).
  * A student may self-check-in only if they are on the roster.

All Present/Absent rows go into the existing attendance tables (mark_present / close_session).
"""
from django.db import transaction
from django.utils import timezone

from course.access import can_manage_semester_course
from course.models import AttendanceRecord, CourseEnrollment
from service.event_rules import attendance_roster, can_manage_event_attendance
from service.models import ServiceAttendance

from .models import AttendanceSession, CheckIn


class AttendanceError(Exception):
    """A plain-language reason with a short machine code the apps can translate."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# ---- who may do what --------------------------------------------------------------------------------------

def is_organizer(user, session):
    if session.event_id:
        return can_manage_event_attendance(user, session.event)
    return can_manage_semester_course(user, session.course_session.semester_course)


def can_open_for(user, event=None, course_session=None):
    if event is not None:
        return can_manage_event_attendance(user, event)
    return can_manage_semester_course(user, course_session.semester_course)


def is_scanner(user, session):
    return is_organizer(user, session) or session.helpers.filter(pk=user.pk).exists()


def roster(session):
    """Users who should have been there."""
    if session.event_id:
        return attendance_roster(session.event)
    from django.contrib.auth import get_user_model

    enrolled = CourseEnrollment.objects.filter(semester_course=session.course_session.semester_course_id).values("student_id")
    return get_user_model().objects.filter(pk__in=enrolled, is_active=True).select_related("student_profile")


def on_roster(session, user):
    return roster(session).filter(pk=user.pk).exists()


# ---- open / close -----------------------------------------------------------------------------------------

def open_session(user, event=None, course_session=None):
    """Open a session for the target, or return the one already open."""
    if (event is None) == (course_session is None):
        raise AttendanceError("target", "Give an event or a class day.")
    if not can_open_for(user, event, course_session):
        raise AttendanceError("forbidden", "You may not take attendance here.", 403)
    if course_session is not None:
        from course.access import assert_not_completed

        assert_not_completed(course_session.semester_course)
    with transaction.atomic():
        existing = AttendanceSession.objects.filter(event=event, course_session=course_session, closed_at__isnull=True).first()
        if existing:
            return existing, False
        session = AttendanceSession.objects.create(
            event=event, course_session=course_session, opened_by=user,
            auto_close_at=AttendanceSession.default_auto_close(event, course_session),
        )
        return session, True


def close_session(session, user=None):
    """Close the session; everyone on the roster without a record becomes Absent. Returns the number of new Absent rows."""
    if not session.is_open:
        return 0
    with transaction.atomic():
        session = AttendanceSession.objects.select_for_update().get(pk=session.pk)
        if not session.is_open:
            return 0
        absent = _mark_rest_absent(session, user)
        session.closed_at = timezone.now()
        session.closed_by = user
        session.save(update_fields=["closed_at", "closed_by"])
    return absent


def reopen_session(session):
    """Open it again (late students, corrections). The Absent rows stay until someone is marked Present."""
    if session.is_open:
        return
    session.closed_at = None
    session.closed_by = None
    session.save(update_fields=["closed_at", "closed_by"])


def _mark_rest_absent(session, user):
    ids = set(roster(session).values_list("pk", flat=True))
    if session.event_id:
        done = set(ServiceAttendance.objects.filter(event_id=session.event_id, student_id__in=ids).values_list("student_id", flat=True))
        rows = [ServiceAttendance(event_id=session.event_id, student_id=pk, status=ServiceAttendance.ABSENT, remark="") for pk in ids - done]
        ServiceAttendance.objects.bulk_create(rows, ignore_conflicts=True)
    else:
        done = set(AttendanceRecord.objects.filter(session_id=session.course_session_id, student_id__in=ids).values_list("student_id", flat=True))
        rows = [AttendanceRecord(session_id=session.course_session_id, student_id=pk, status="ABSENT", marked_by=user) for pk in ids - done]
        AttendanceRecord.objects.bulk_create(rows, ignore_conflicts=True)
    return len(rows)


# ---- marking ----------------------------------------------------------------------------------------------

def mark_present(session, student, method, scanned_by=None, scanned_at=None):
    """
    Mark the student Present in the real attendance table and log the check-in.
    Returns (check_in, created). A second scan of the same student returns the first check-in, created=False.
    """
    if not session.is_open:
        raise AttendanceError("closed", "Attendance is closed for this session.", 409)
    if not on_roster(session, student):
        raise AttendanceError("not_on_roster", "This student is not on the list for this session.")
    with transaction.atomic():
        check_in, created = CheckIn.objects.get_or_create(
            session=session, student=student,
            defaults={"method": method, "scanned_by": scanned_by, "scanned_at": scanned_at or timezone.now()},
        )
        if created:
            if session.event_id:
                ServiceAttendance.objects.update_or_create(
                    event_id=session.event_id, student=student, defaults={"status": ServiceAttendance.PRESENT},
                )
            else:
                AttendanceRecord.objects.update_or_create(
                    session_id=session.course_session_id, student=student,
                    defaults={"status": "PRESENT", "marked_by": scanned_by or student},
                )
    return check_in, created


def counts(session):
    """Present so far and roster size, for the organizer's screen."""
    if session.event_id:
        present = ServiceAttendance.objects.filter(event_id=session.event_id, status=ServiceAttendance.PRESENT).count()
    else:
        present = AttendanceRecord.objects.filter(session_id=session.course_session_id, status="PRESENT").count()
    return {"present": present, "roster": roster(session).count()}
