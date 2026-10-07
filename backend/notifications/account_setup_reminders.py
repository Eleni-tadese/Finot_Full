"""
Reminders for students who still use the slip they were given (see student/account_setup.py).
Run daily (see .github/workflows/account-setup-reminders.yml). Each stage is sent once per student:
14 days left, 7, 3, 1, and the day the slip expires.
"""
from django.utils import timezone

from student.account_setup import is_slip_email, status_for
from student.models import StudentProfile

from .models import FCMDeviceToken, Notification

# (stage number, days left at or below which it is sent, title, message)
STAGES = [
    (1, 14, "Add your own email to Finot", "Your login slip works for {days} more days. Please add your real email and choose a new password (Account page)."),
    (2, 7, "One week left on your login slip", "Your slip stops working in {days} days. Add your real email and a new password now so you can still sign in."),
    (3, 3, "Your login slip ends soon", "Only {days} days left. Add your real email and a new password on the Account page."),
    (4, 1, "Last day of your login slip", "Your slip stops working tomorrow. Add your real email and a new password today."),
    (5, 0, "Finish your account to continue", "Your slip has expired. Add your real email and a new password to open Finot again."),
]


def send_account_setup_reminders():
    """Returns {"checked": n, "reminded": n, "devices": n}."""
    profiles = StudentProfile.objects.filter(setup_deadline__isnull=False, setup_completed_at__isnull=True, user__is_active=True).select_related("user")
    notes, user_ids_for_push, checked = [], {}, 0
    for profile in profiles:
        checked += 1
        st = status_for(profile.user)
        if st is None or not st["pending"]:
            continue
        due = [s for s in STAGES if st["days_left"] <= s[1] and (s[1] > 0 or st["required"])]
        if not due:
            continue
        stage, _, title, message = due[-1]
        if stage <= profile.setup_reminder_stage:
            continue
        text = message.format(days=st["days_left"])
        notes.append(Notification(user=profile.user, title=title, message=text, notification_type=Notification.TYPE_SYSTEM))
        user_ids_for_push[profile.user_id] = (title, text)
        StudentProfile.objects.filter(pk=profile.pk).update(setup_reminder_stage=stage)
    Notification.objects.bulk_create(notes)
    devices = 0
    if user_ids_for_push:
        try:
            from .channels.push import _initialize_firebase, _send_fcm_multicast

            _initialize_firebase()
            for uid, (title, text) in user_ids_for_push.items():
                tokens = list(FCMDeviceToken.objects.filter(user_id=uid).values_list("device_token", flat=True))
                if tokens:
                    _send_fcm_multicast(title=title, body=text, notification_type=Notification.TYPE_SYSTEM, device_tokens=tokens)
                    devices += len(tokens)
        except Exception:  # a broken push channel must never stop the in-app reminders
            import logging
            logging.getLogger(__name__).exception("Could not push the account set-up reminders")
    return {"checked": checked, "reminded": len(notes), "devices": devices}
