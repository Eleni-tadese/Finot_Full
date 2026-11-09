from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.core.exceptions import PermissionDenied

User = get_user_model()

class EmailAuthenticationBackend(ModelBackend):
    """
    Custom authentication backend to allow users to log in using their email address.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        # We check both email and username just to be safe
        try:
            user = User.objects.get(email=username)
        except User.DoesNotExist:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                # No such account (a typo in the slip email is common). Refuse at once. Without this, Django goes on to
                # the next backends and each one hashes the password at full strength (more than a second of CPU each,
                # about 5 s on the free server), so a few typing mistakes could freeze the sign-in for everybody.
                raise PermissionDenied

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
