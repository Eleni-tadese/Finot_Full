"""
JWT sign-in that also enforces the account set-up deadline (see account_setup.py): once a bulk-registered student's
slip has expired, every call except the set-up ones is refused with the code `account_setup_required`.
"""
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.messages import tr
from service.i18n import request_language

from django.utils import timezone

from .account_setup import is_blocked, must_replace_password, needs_name

OPEN_PREFIXES = ("/auth/users/me", "/auth/jwt/", "/api/account/", "/auth/users/reset_password")


class SetupAwareJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, _ = result
        if not request.path.startswith(OPEN_PREFIXES) and is_blocked(user):
            profile = getattr(user, "student_profile", None)
            replace_only = must_replace_password(profile) and timezone.now() < profile.setup_deadline
            message = (
                "Your email is confirmed. Choose your new password to continue."
                if replace_only and not needs_name(user)
                else "Your first slip has expired. Add your own email and a new password to continue."
            )
            raise PermissionDenied({
                "detail": tr(message, request_language(request)),
                "code": "account_setup_required",
            })
        return result
