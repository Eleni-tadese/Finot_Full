"""
Automatic enrolment: a course made for year N appears for every in-campus student of year N, with no button to press.

  * a semester course is opened      -> all students of that year are enrolled
  * a student's year or stage changes -> they are enrolled in the latest semester course of each active
                                         curriculum made for their year (this also covers the yearly rollover)

An enrolment in a running course of ANOTHER year is removed when the student's year changes, unless attendance was
already taken for them there (that is history and stays). Graduates and inactive accounts are not enrolled.
"""
from django.contrib.auth import get_user_model

from student.models import StudentProfile

from .models import Course, CourseEnrollment

User = get_user_model()


def enrol_batch(semester_course):
    """Enrol every in-campus student of the curriculum's year. Returns how many were newly enrolled."""
    already = set(CourseEnrollment.objects.filter(semester_course=semester_course).values_list("student_id", flat=True))
    students = User.objects.filter(
        is_active=True,
        student_profile__batch_year=semester_course.course.batch_year,
        student_profile__status=StudentProfile.IN_CAMPUS,
    ).exclude(pk__in=already)
    rows = [CourseEnrollment(semester_course=semester_course, student=s) for s in students]
    CourseEnrollment.objects.bulk_create(rows, ignore_conflicts=True)
    return len(rows)


def latest_semester_courses(batch_year):
    """For each active curriculum of this year: its most recent semester course."""
    found = []
    for course in Course.objects.filter(is_active=True, batch_year=batch_year):
        latest = course.semester_courses.exclude(status="COMPLETED").order_by("-academic_year", "-semester").first()
        if latest is not None:
            found.append(latest)
    return found


def enrol_student(user):
    """Enrol one student in what their year is studying now. Returns how many new enrolments were made."""
    profile = getattr(user, "student_profile", None)
    if profile is None or profile.batch_year is None or profile.status != StudentProfile.IN_CAMPUS or not user.is_active:
        return 0
    made = 0
    for semester_course in latest_semester_courses(profile.batch_year):
        _, created = CourseEnrollment.objects.get_or_create(semester_course=semester_course, student=user)
        made += int(created)
    leave_other_years(user, profile.batch_year)
    return made


def leave_other_years(user, batch_year):
    """Drop enrolments in running courses of other years where nothing was ever recorded. Returns how many."""
    from .models import AttendanceRecord, SemesterCourse

    stale = (
        CourseEnrollment.objects.filter(student=user)
        .exclude(semester_course__course__batch_year=batch_year)
        .exclude(semester_course__status=SemesterCourse.COMPLETED)
    )
    gone = 0
    for enrolment in stale:
        if AttendanceRecord.objects.filter(student=user, session__semester_course=enrolment.semester_course).exists():
            continue  # attendance was taken: keep the history
        enrolment.delete()
        gone += 1
    return gone
