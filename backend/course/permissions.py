from rest_framework import permissions
from core.models import Role
from course.models import SemesterCourse
from course.access import can_manage_semester_course


def _semester_course_of(obj):
    if isinstance(obj, SemesterCourse):
        return obj
    semester_course = getattr(obj, 'semester_course', None)
    if semester_course is None and hasattr(obj, 'session'):
        semester_course = obj.session.semester_course
    return semester_course


class IsSuperAdmin(permissions.BasePermission):
    """
    Only users with the SuperAdmin role have access.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.roles.filter(name=Role.SUPER_ADMIN).exists()


class IsCourseCoordinator(permissions.BasePermission):
    """
    Super Admin, or a Course Coordinator. A coordinator may only act on the semester
    courses where they are named (checked per object here and in the views).
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.roles.filter(name__in=[Role.SUPER_ADMIN, Role.COURSE_COORDINATOR]).exists()

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        semester_course = _semester_course_of(obj)
        return bool(semester_course) and can_manage_semester_course(request.user, semester_course)


class IsEnrolledStudentOrCoordinator(permissions.BasePermission):
    """
    Students can read data for semester courses they are enrolled in.
    Super Admin reads everything; a coordinator reads the courses where they are named.
    """
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        semester_course = _semester_course_of(obj)
        if not semester_course:
            return False
        if can_manage_semester_course(request.user, semester_course):
            return True
        return semester_course.enrollments.filter(student=request.user).exists()
