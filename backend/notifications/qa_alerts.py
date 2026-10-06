"""
Quick alerts for the Q&A staff.

  * public question / answer waiting  -> every active moderator (the Super Admins if there is no moderator)
  * new private question              -> the counselors who can see it; the Super Admins when nobody can
                                         (sensitive Personal question, or a category no counselor handles)
  * private question assigned         -> that counselor

Each alert is an in-app notification (the bell) plus a phone push where Firebase is set up.
"""
import logging

from django.contrib.auth import get_user_model

from core.models import Role

from .models import FCMDeviceToken, Notification

logger = logging.getLogger(__name__)
User = get_user_model()


def _super_admins():
    return User.objects.filter(is_active=True, roles__name=Role.SUPER_ADMIN).distinct()


def _people_who_approve():
    moderators = User.objects.filter(is_active=True, roles__name=Role.QA_MODERATOR).distinct()
    return moderators if moderators.exists() else _super_admins()


def _notify(user_ids, title, message):
    """In-app notification and push for these people. Returns how many were told."""
    user_ids = list(dict.fromkeys(user_ids))
    if not user_ids:
        return 0
    Notification.objects.bulk_create([
        Notification(user_id=uid, title=title, message=message, notification_type=Notification.TYPE_QA)
        for uid in user_ids
    ])
    tokens = list(FCMDeviceToken.objects.filter(user_id__in=user_ids).values_list("device_token", flat=True))
    if tokens:
        try:
            from notifications.channels.push import _initialize_firebase, _send_fcm_multicast
            _initialize_firebase()
            _send_fcm_multicast(title=title, body=message, notification_type=Notification.TYPE_QA, device_tokens=tokens)
        except Exception:  # a broken push channel must never block a question being posted
            logger.exception("Could not push the Q&A alert")
    return len(user_ids)


def notify_moderators(title, message):
    return _notify(_people_who_approve().values_list("id", flat=True), title, message)


def notify_counselors_of_private_question(question):
    """Tell the counselors who can see this question; if nobody can, tell the Super Admins to assign it."""
    from questionanswer.visibility import can_access_private_question

    body = f"({question.category}) {short(question.question_body)}"
    counselors = User.objects.filter(is_active=True, roles__name=Role.QA_COUNSELOR).distinct().exclude(pk=question.user_id)
    reach = [c.id for c in counselors if can_access_private_question(c, question)]
    if reach:
        return _notify(reach, "New private question", body)
    return _notify(
        _super_admins().values_list("id", flat=True),
        "A private question needs a counselor",
        f"{body}. Nobody can see it yet: assign a counselor in Private Q&A.",
    )


def notify_counselor_assigned(assignment):
    question = assignment.question
    return _notify([assignment.counselor_id], "A private question was assigned to you", f"({question.category}) {short(question.question_body)}")


def short(text, limit=140):
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "..."
