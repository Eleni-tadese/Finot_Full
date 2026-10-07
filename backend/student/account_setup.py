"""
The account set-up of students registered by the bulk import (see account_import.py).

A student gets a printed slip: a made-up login email and a random password. Both work until `setup_deadline`.
Before then the student can sign in, complete the profile and move to a real email and a private password
whenever they like. After the deadline every page except this set-up is closed until both are done:
  * a real email, confirmed with a 6-digit code sent to it;
  * a new password.
Any student (imported or not) can also change their email or password at any time with the same calls.
"""
import hashlib
import hmac
import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils import timezone

from .account_import import SLIP_DOMAINS, new_password, quick_hash
from .models import EmailVerification, StudentProfile

User = get_user_model()

CODE_MINUTES = 15
MAX_ATTEMPTS = 5
MAX_CODES_PER_HOUR = 5


class SetupError(Exception):
    """A plain-language reason shown to the student (field -> message)."""

    def __init__(self, message, field="detail"):
        super().__init__(message)
        self.field = field
        self.message = message


def is_slip_email(email):
    return (email or "").lower().endswith(tuple("@" + d for d in SLIP_DOMAINS))


def _profile(user):
    return getattr(user, "student_profile", None)


def is_pending(profile):
    return bool(profile and profile.setup_deadline and not profile.setup_completed_at)


def needs_name(user):
    """A slip made without a name: the student must write their name (and gender) before anything else."""
    return not (user.first_name and user.middle_name and user.last_name and user.gender)


def is_blocked(user):
    """True when every other page must stay closed: the slip expired, or the name is still missing."""
    profile = _profile(user)
    return is_pending(profile) and (timezone.now() >= profile.setup_deadline or needs_name(user))


def status_for(user):
    """What the front end needs to show the banner and the set-up page. None for accounts that never had a slip."""
    profile = _profile(user)
    if not profile or not profile.setup_deadline:
        return None
    pending = is_pending(profile)
    remaining = (profile.setup_deadline - timezone.now()).total_seconds()
    no_name = pending and needs_name(user)
    return {
        "pending": pending,
        "expired": pending and remaining <= 0,
        # the Account page is the only open page while the slip is expired or the student has not written their name
        "required": pending and (remaining <= 0 or no_name),
        "needs_name": no_name,
        "deadline": profile.setup_deadline,
        "days_left": max(0, math.ceil(remaining / 86400)) if pending else 0,
        "needs_email": pending and is_slip_email(user.email),
        "needs_password": pending and profile.password_changed_at is None,
        "completed_at": profile.setup_completed_at,
    }


def refresh_completion(user):
    """Finished once the email is a real one and the password has been changed."""
    profile = _profile(user)
    if is_pending(profile) and not is_slip_email(user.email) and profile.password_changed_at:
        profile.setup_completed_at = timezone.now()
        profile.save(update_fields=["setup_completed_at"])


def _digest(user, email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{user.pk}:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def request_email_code(user, new_email, current_password):
    """Send a 6-digit code to the new address. The login changes only when the code comes back."""
    from notifications.channels.email import _send_html_email
    from notifications.reminders import is_deliverable

    if not user.check_password(current_password or ""):
        raise SetupError("The current password is not correct.", "current_password")
    email = (new_email or "").strip().lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise SetupError("Write a valid email address.", "email")
    if is_slip_email(email) or not is_deliverable(email):
        raise SetupError("Use your own real email address.", "email")
    if email == (user.email or "").lower():
        raise SetupError("This is already your email.", "email")
    if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists() or User.objects.filter(username__iexact=email).exclude(pk=user.pk).exists():
        raise SetupError("This email is already used by another account.", "email")
    recent = EmailVerification.objects.filter(user=user, created_at__gte=timezone.now() - timedelta(hours=1)).count()
    if recent >= MAX_CODES_PER_HOUR:
        raise SetupError("Too many codes were requested. Try again in an hour.")
    code = f"{secrets.randbelow(10 ** 6):06d}"
    sent = _send_html_email(
        "Your Finot confirmation code", [email],
        message_body=(f"<p>Your confirmation code is</p><p style=\"font-size: 28px; font-weight: bold; letter-spacing: 6px;\">{code}</p>"
                      f"<p>It works for {CODE_MINUTES} minutes. If you did not ask for it, ignore this message.</p>"),
    )
    if not sent:
        raise SetupError("The email could not be sent. Check the address and try again.", "email")
    # Only the newest code counts; older ones are removed but still counted toward the hourly limit by created_at
    EmailVerification.objects.filter(user=user).update(expires_at=timezone.now())
    EmailVerification.objects.create(
        user=user, new_email=email, code_hash=_digest(user, email, code), expires_at=timezone.now() + timedelta(minutes=CODE_MINUTES),
    )
    return email


def confirm_email_code(user, code):
    """Check the code; on success the email (and the login name) becomes the new address."""
    verification = EmailVerification.objects.filter(user=user, expires_at__gt=timezone.now()).order_by("-created_at").first()
    if verification is None:
        raise SetupError("The code has expired. Ask for a new one.", "code")
    verification.attempts += 1
    verification.save(update_fields=["attempts"])
    if verification.attempts > MAX_ATTEMPTS:
        verification.expires_at = timezone.now()
        verification.save(update_fields=["expires_at"])
        raise SetupError("Too many wrong codes. Ask for a new one.", "code")
    if not hmac.compare_digest(verification.code_hash, _digest(user, verification.new_email, str(code or "").strip())):
        raise SetupError("This code is not correct.", "code")
    if User.objects.filter(email__iexact=verification.new_email).exclude(pk=user.pk).exists():
        raise SetupError("This email is already used by another account.", "code")
    user.email = user.username = verification.new_email
    user.save(update_fields=["email", "username"])
    verification.expires_at = timezone.now()
    verification.save(update_fields=["expires_at"])
    refresh_completion(user)
    return user.email


def _clean_name(value, label):
    text = " ".join(str(value or "").split())
    if not text:
        raise SetupError(f"{label} is required.", label_field(label))
    if len(text) > 150:
        raise SetupError(f"{label} is too long.", label_field(label))
    return text


def label_field(label):
    return {"First name": "first_name", "Father's name": "middle_name", "Grandfather's name": "last_name"}.get(label, "detail")


def set_names(user, first_name, middle_name, last_name, gender):
    """The student writes their own name once. Afterwards only the Super Admin can change it."""
    profile = _profile(user)
    if not is_pending(profile) or not needs_name(user):
        raise SetupError("Your name is already saved. Ask an administrator to change it.")
    user.first_name = _clean_name(first_name, "First name")
    user.middle_name = _clean_name(middle_name, "Father's name")
    user.last_name = _clean_name(last_name, "Grandfather's name")
    if gender not in ("M", "F"):
        raise SetupError("Choose male or female.", "gender")
    user.gender = gender
    user.save(update_fields=["first_name", "middle_name", "last_name", "gender"])


def change_password(user, current_password, new_password_text):
    if not user.check_password(current_password or ""):
        raise SetupError("The current password is not correct.", "current_password")
    if current_password == new_password_text:
        raise SetupError("Choose a password different from the current one.", "new_password")
    try:
        validate_password(new_password_text, user)
    except DjangoValidationError as exc:
        raise SetupError(" ".join(exc.messages), "new_password")
    user.set_password(new_password_text)
    user.save(update_fields=["password"])
    profile = _profile(user)
    if profile is not None:
        profile.password_changed_at = timezone.now()
        profile.save(update_fields=["password_changed_at"])
    refresh_completion(user)


def reissue_slip(user, days=None):
    """
    A lost slip: a new random password, and the deadline starts again. Only for students who have not finished
    their set-up (after that they use "Forgot password" with their own email). Returns the new credentials.
    """
    profile = _profile(user)
    if profile is None or profile.setup_deadline is None:
        raise SetupError("This account was not registered from a list.")
    if profile.setup_completed_at:
        raise SetupError("This student finished the set-up. They can use Forgot password with their own email.")
    batch_days = profile.import_batch.grace_days if profile.import_batch_id else int(getattr(settings, "ACCOUNT_SETUP_GRACE_DAYS", 21))
    days = days or batch_days
    password = new_password()
    user.password = quick_hash(password)
    user.save(update_fields=["password"])
    profile.setup_deadline = timezone.now() + timedelta(days=days)
    profile.password_changed_at = None
    profile.setup_reminder_stage = 0
    profile.save(update_fields=["setup_deadline", "password_changed_at", "setup_reminder_stage"])
    return {
        "name": " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p),
        "email": user.email, "password": password, "grace_days": days, "deadline": profile.setup_deadline,
    }
