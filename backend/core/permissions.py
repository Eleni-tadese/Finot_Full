from django.conf import settings
from rest_framework import permissions


class SelfRegistrationOpen(permissions.BasePermission):
    """Accounts are given by the organization (printed slips); the public sign-up call is closed unless the owner opens it."""

    message = "Accounts are given by the organization. Ask for your login slip."

    def has_permission(self, request, view):
        return bool(getattr(settings, "SELF_REGISTRATION_OPEN", False))

class IsAuthenticatedAndReadOnly(permissions.BasePermission):
    """
    Djoser user endpoints (read only): a signed-in person may read their OWN record; a Super Admin may read any.
    Nobody else can look up another account by its id, and visitors who are not signed in get nothing.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.method in permissions.SAFE_METHODS)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated and request.method in permissions.SAFE_METHODS):
            return False
        if getattr(obj, "pk", None) == user.pk:
            return True
        return user.is_superuser or user.roles.filter(name="SuperAdmin").exists()
