"""
"Class tomorrow": the evening before each class day, every student enrolled in the course gets an in-app
notification (and a phone push where Firebase is set up). Each class day is announced once; moving its date
clears the mark so the new date is announced again.

Ethiopia is UTC+3 all year (no daylight saving), so "tomorrow" is worked out at that offset.
"""
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

from course.models import CourseEnrollment, CourseSession
from notifications.channels.push import _initialize_firebase, _send_fcm_multicast
from notifications.models import FCMDeviceToken, Notification
from student.participation import participating_q

ETHIOPIA = dt_timezone(timedelta(hours=3))


def today_in_ethiopia():
    return datetime.now(ETHIOPIA).date()


def _message(session):
    day = f"{session.date:%A, %d %B %Y}"
    parts = [f"{session.semester_course.course.title} meets tomorrow ({day})."]
    if session.topic:
        parts.append(f"Topic: {session.topic}.")
    if session.teacher_name:
        parts.append(f"Teacher: {session.teacher_name}.")
    parts.append("Please be there on time.")
    return " ".join(parts)


def send_class_reminders(today=None, force=False):
    """Returns {"sessions": n, "students": n, "devices": n}."""
    today = today or today_in_ethiopia()
    tomorrow = today + timedelta(days=1)
    sessions = CourseSession.objects.filter(date=tomorrow, semester_course__status="OPEN").select_related("semester_course__course")
    if not force:
        sessions = sessions.filter(reminder_sent_at__isnull=True)

    sessions_done = students_total = devices_total = 0
    firebase_ready = False
    for session in sessions:
        user_ids = list(
            CourseEnrollment.objects.filter(participating_q("student__"), semester_course=session.semester_course)
            .values_list("student_id", flat=True)
        )
        title = f"Class tomorrow: {session.semester_course.course.title}"
        body = _message(session)
        Notification.objects.bulk_create([
            Notification(user_id=uid, title=title, message=body, notification_type=Notification.TYPE_REMINDER)
            for uid in user_ids
        ])
        tokens = list(FCMDeviceToken.objects.filter(user_id__in=user_ids).values_list("device_token", flat=True))
        if tokens:
            if not firebase_ready:
                _initialize_firebase()
                firebase_ready = True
            _send_fcm_multicast(title=title, body=body, notification_type=Notification.TYPE_REMINDER, device_tokens=tokens)
        session.reminder_sent_at = timezone.now()
        session.save(update_fields=["reminder_sent_at"])
        sessions_done += 1
        students_total += len(user_ids)
        devices_total += len(tokens)
    return {"sessions": sessions_done, "students": students_total, "devices": devices_total}
