"""
Who may manage a course.

A Course Coordinator manages only the semester courses where the Super Admin named them
(SemesterCourse.coordinators). The role alone opens nothing. Super Admin manages everything.
"""
from core.models import Role


def is_super_admin(user):
    return bool(user and user.is_authenticated and user.roles.filter(name=Role.SUPER_ADMIN).exists())


def has_coordinator_role(user):
    return bool(user and user.is_authenticated and user.roles.filter(name=Role.COURSE_COORDINATOR).exists())


def can_manage_semester_course(user, semester_course):
    """Super Admin, or a Course Coordinator named on this semester course."""
    if is_super_admin(user):
        return True
    if not has_coordinator_role(user):
        return False
    return semester_course.coordinators.filter(pk=user.pk).exists()


def assert_not_completed(semester_course):
    """A completed course is a record: class days and attendance are frozen until it is reopened."""
    from rest_framework.exceptions import ValidationError
    if semester_course.status == semester_course.COMPLETED:
        raise ValidationError({"error": "This course is completed. Reopen it to change class days or attendance."})


def can_manage_curriculum(user, course):
    """Materials belong to a curriculum: allowed if named on any semester course of it."""
    if course is None:
        return False
    if is_super_admin(user):
        return True
    if not has_coordinator_role(user):
        return False
    return course.semester_courses.filter(coordinators=user).exists()


def courses_as_student(user):
    """
    The semester courses this person takes as a STUDENT (never the ones they only coordinate):
    enrolled, and either completed (history) or open for the batch they are in now.
    """
    from django.db.models import Q
    from course.models import SemesterCourse

    batch = getattr(getattr(user, "student_profile", None), "batch_year", None)
    wanted = Q(status=SemesterCourse.COMPLETED)
    if batch is not None:
        wanted |= Q(status=SemesterCourse.OPEN, course__batch_year=batch)
    else:
        wanted |= Q(status=SemesterCourse.OPEN)  # no year on record: they cannot be auto-enrolled, so trust the enrolment
    return SemesterCourse.objects.filter(wanted, enrollments__student=user).distinct()
