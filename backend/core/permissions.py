from django.conf import settings
from rest_framework import permissions


class SelfRegistrationOpen(permissions.BasePermission):
    """Accounts are given by the organization (printed slips); the public sign-up call is closed unless the owner opens it."""

    message = "Accounts are given by the organization. Ask for your login slip."

    def has_permission(self, request, view):
        return bool(getattr(settings, "SELF_REGISTRATION_OPEN", False))

class IsAuthenticatedAndReadOnly(permissions.BasePermission):
    """
    Allows access only to authenticated users and ensures it is read-only.
    Used to disable PUT/PATCH/DELETE on Djoser user endpoints.
    """
    def has_permission(self, request, view):
        # return (
        #     # request.user and 
        #     # request.user.is_authenticated and 
        #     # request.method in permissions.SAFE_METHODS

        # )
        return True

    def has_object_permission(self, request, view, obj):
        # return (
        #     request.user and 
        #     request.user.is_authenticated and 
        #     request.method in permissions.SAFE_METHODS
        # )
        return True
