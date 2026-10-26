"""
Business rules of smart attendance, reusing the existing event and course rules.

  * Organizer: the person who may take attendance today (service.event_rules.can_manage_event_attendance for events,
    course.access.can_manage_semester_course for class days). Only an organizer opens, closes, reopens and names helpers.
  * Scanner: an organizer or a helper named on the session. Only they may scan badges and read the room code.
  * Roster: who should have been there (service.event_rules.attendance_roster, or the enrolled students).
  * A student may self-check-in only if they are on the roster.

All Present/Absent rows go into the existing attendance tables (mark_present / close_session).
"""
from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import IntegrityError, transaction
from django.utils import timezone

from course.access import can_manage_semester_course
from course.models import AttendanceRecord, CourseEnrollment
from service.event_rules import attendance_roster, can_manage_event_attendance, is_super_admin
from service.models import ServiceAttendance

from .models import AttendanceSession, CheckIn
from student.participation import participating_q


ETHIOPIA = dt_timezone(timedelta(hours=3))

# An event's attendance can be opened from this long before it starts (students arrive early) until its auto-close time.
OPEN_BEFORE_START = timedelta(hours=1)


def today_in_ethiopia():
    return datetime.now(ETHIOPIA).date()


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
    return get_user_model().objects.filter(participating_q(), pk__in=enrolled).select_related("student_profile")


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
        if course_session.date != today_in_ethiopia():
            # scanning and the room code are for the day itself; a past day is corrected with Mark attendance
            raise AttendanceError("not_today", "Scanning works only on the class day itself. For a past day use Mark attendance.")
    existing = AttendanceSession.objects.filter(event=event, course_session=course_session, closed_at__isnull=True).first()
    if existing:
        return existing, False
    if event is not None and not is_super_admin(user):
        # like a class day, an event has its own time (the Super Admin may open any time, for a rescue or a test)
        now = timezone.now()
        if now < event.start_date - OPEN_BEFORE_START:
            raise AttendanceError("not_yet", "Attendance opens one hour before the event starts.")
        if now > AttendanceSession.default_auto_close(event=event):
            raise AttendanceError("ended", "This event has ended. Correct a past event with Mark attendance on the website.")
    try:
        with transaction.atomic():
            session = AttendanceSession.objects.create(
                event=event, course_session=course_session, opened_by=user,
                auto_close_at=AttendanceSession.default_auto_close(event, course_session),
            )
    except IntegrityError:
        # two taps at the same moment: the other one won, hand back its session
        return AttendanceSession.objects.filter(event=event, course_session=course_session, closed_at__isnull=True).first(), False
    return session, True


def closes_early(session, user):
    """A person closing an EVENT's attendance while the event is still running: it only stops the scanning."""
    return bool(user is not None and session.event_id and timezone.now() < session.event.end_date)


def close_session(session, user=None):
    """
    Close the session. Everyone on the roster without a record becomes Absent, EXCEPT when a person closes an event that
    has not ended yet: that only stops scanning, and the Absent marks come at the end (close_stale_sessions, 2 hours
    after the event). Returns the number of new Absent rows.
    """
    if not session.is_open:
        return 0
    with transaction.atomic():
        session = AttendanceSession.objects.select_for_update().get(pk=session.pk)
        if not session.is_open:
            return 0
        absent = 0 if closes_early(session, user) else _mark_rest_absent(session, user)
        session.closed_at = timezone.now()
        session.closed_by = user
        session.save(update_fields=["closed_at", "closed_by"])
    return absent


def reopen_session(session, user=None):
    """
    Open it again (late students, corrections). The Absent rows stay until someone is marked Present.
    Same time limits as opening: an event until its auto-close time (2 hours after it ends), a class day only on its date.
    After that, corrections are made by hand (Mark attendance).
    """
    if session.is_open:
        return
    if session.event_id:
        if not is_super_admin(user) and timezone.now() > AttendanceSession.default_auto_close(event=session.event):
            raise AttendanceError("ended", "This event has ended. Correct it with Mark attendance.")
    elif session.course_session.date != today_in_ethiopia():
        raise AttendanceError("not_today", "A class day can be reopened only on its own date. Use Mark attendance for a past day.")
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


def close_stale_sessions(now=None):
    """Close every session past its auto_close_at (the organizer forgot). Returns (sessions closed, students marked absent)."""
    now = now or timezone.now()
    closed = absent = 0
    for session in AttendanceSession.objects.filter(closed_at__isnull=True, auto_close_at__lte=now):
        absent += close_session(session, user=None)
        closed += 1
    # sessions an organizer closed EARLY (while the event was running) get their Absent marks now that it is over.
    # Only the missing rows are added, so running this again never changes an existing mark.
    for session in AttendanceSession.objects.filter(
        closed_at__isnull=False, event__isnull=False, auto_close_at__lte=now, auto_close_at__gte=now - timedelta(days=7)
    ).select_related("event"):
        absent += _mark_rest_absent(session, None) or 0
    return closed, absent
