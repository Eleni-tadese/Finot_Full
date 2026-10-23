"""
Attendance percentage calculation for courses.

percentage = PRESENT records / sessions held, where a session counts as "held"
once attendance was marked for at least one student. Sessions that were created
but never marked do not lower anyone's percentage.
"""
from django.db.models import Count, Q

from .access import courses_as_student
from .models import AttendanceRecord, CourseEnrollment, CourseSession
from student.participation import participating_q


def _percentage(present, held):
    return round(present * 100 / held, 1) if held else 0.0


def held_sessions_count(semester_course):
    return (
        CourseSession.objects.filter(semester_course=semester_course)
        .annotate(n=Count("attendance_records"))
        .filter(n__gt=0)
        .count()
    )


def course_attendance_report(semester_course):
    """
    Per-student attendance for one SemesterCourse: totals, percentage, and the status on every class day.

    "sessions" lists every class day in date order with whether attendance was marked for it;
    each student row has "days": {session_id: "PRESENT" | "ABSENT"} (a day that is missing was not marked).
    """
    held = held_sessions_count(semester_course)
    sessions = list(
        CourseSession.objects.filter(semester_course=semester_course)
        .annotate(n=Count("attendance_records"))
        .order_by("date")
    )
    enrollments = (
        CourseEnrollment.objects.filter(participating_q("student__"), semester_course=semester_course)  # no deactivated accounts, no unused slips
        .select_related("student")
        .order_by("student__first_name", "student__middle_name", "student__last_name")
    )
    days = {}
    for student_id, session_id, status in AttendanceRecord.objects.filter(
        session__semester_course=semester_course
    ).values_list("student_id", "session_id", "status"):
        days.setdefault(student_id, {})[str(session_id)] = status

    students = []
    for enrollment in enrollments:
        student = enrollment.student
        mine = days.get(student.id, {})
        present = sum(1 for s in mine.values() if s == "PRESENT")
        absent = sum(1 for s in mine.values() if s == "ABSENT")
        students.append({
            "student_id": student.id,
            "username": student.username,
            "first_name": student.first_name,
            "middle_name": getattr(student, "middle_name", "") or "",
            "last_name": student.last_name,
            "present": present,
            "absent": absent,
            "unmarked": max(held - present - absent, 0),
            "percentage": _percentage(present, held),
            "days": mine,
        })
    average = round(sum(s["percentage"] for s in students) / len(students), 1) if students else 0.0
    return {
        "semester_course": str(semester_course.id),
        "course_title": semester_course.course.title,
        "batch_year": semester_course.course.batch_year,
        "academic_year": semester_course.academic_year,
        "semester": semester_course.semester,
        "status": semester_course.status,
        "sessions_total": len(sessions),
        "sessions_held": held,
        "student_count": len(students),
        "average_percentage": average,
        "sessions": [
            {"id": str(s.id), "date": s.date.isoformat(), "topic": s.topic or "", "marked": s.n > 0}
            for s in sessions
        ],
        "students": students,
    }


def student_attendance_summary(user):
    """One entry per course the student is enrolled in."""
    result = []
    enrollments = (
        CourseEnrollment.objects.filter(student=user, semester_course__in=courses_as_student(user))
        .select_related("semester_course", "semester_course__course")
        .order_by("-semester_course__academic_year", "-semester_course__semester")
    )
    for enrollment in enrollments:
        sc = enrollment.semester_course
        held = held_sessions_count(sc)
        records = AttendanceRecord.objects.filter(session__semester_course=sc, student=user)
        present = records.filter(status="PRESENT").count()
        absent = records.filter(status="ABSENT").count()
        result.append({
            "semester_course": str(sc.id),
            "course_title": sc.course.title,
            "academic_year": sc.academic_year,
            "semester": sc.semester,
            "status": sc.status,
            "sessions_held": held,
            "present": present,
            "absent": absent,
            "percentage": _percentage(present, held),
        })
    return result
