"""
The family hub: what a father, mother, son or daughter sees about their family, and the family messages.

Who sees what (decided by the project owner):
  * a father or mother sees each child's contact details, year, department, dorm, section, service groups,
    event attendance and course attendance percentage, and can send messages to the family or to one child;
  * a child sees the father and mother (name, phone, email) and each brother and sister (name, year,
    department, phone) and the messages addressed to them. A child can reply, but only to the father and mother
    (the brothers and sisters never see the reply).
Private details (emergency contact, home address, confession father) are never shown here.
"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from core.models import Role
from notifications.models import FCMDeviceToken, Notification

from .models import Family, FamilyMessage, ServiceAttendance, ServiceGroupMembership

MESSAGE_MAX_LENGTH = 1000
MESSAGES_PER_DAY = 20


def family_of(user):
    """The family this person belongs to as a child, or leads as father or mother. None when there is none."""
    membership = getattr(user, "family_membership", None)
    if membership is not None:
        return membership.family
    return Family.objects.filter(Q(father=user) | Q(mother=user)).first()


def is_parent(user, family):
    return family is not None and user.id in (family.father_id, family.mother_id)


def is_family_manager(user):
    """Super Admin and Family Admin may look at and write to any family."""
    return bool(user.is_superuser or user.roles.filter(name__in=[Role.SUPER_ADMIN, Role.FAMILY_ADMIN]).exists())


def _profile(user):
    return getattr(user, "student_profile", None)


def person_card(user):
    """Contact card of a father or mother."""
    profile = _profile(user)
    return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email,
            "phone": profile.personal_phone if profile else None}


def sibling_card(user):
    """What brothers and sisters may know about each other."""
    profile = _profile(user)
    return {"id": user.id, "name": user.get_full_name() or user.username,
            "year": profile.batch_year if profile else None,
            "department": (profile.department if profile else None) or None,
            "phone": profile.personal_phone if profile else None}


def child_card(user):
    """What a father or mother sees about a child."""
    from course.reports import student_attendance_summary

    profile = _profile(user)
    attendance = ServiceAttendance.objects.filter(student=user)
    present = attendance.filter(status=ServiceAttendance.PRESENT).count()
    absent = attendance.filter(status=ServiceAttendance.ABSENT).count()
    courses = student_attendance_summary(user)
    held = sum(c["sessions_held"] for c in courses)
    attended = sum(c["present"] for c in courses)
    groups = ServiceGroupMembership.objects.filter(student=user).select_related("service_group")
    card = sibling_card(user)
    card.update({
        "email": user.email,
        "dorm_block": profile.dorm_block if profile else None,
        "dorm_room": profile.dorm_room if profile else None,
        "section": profile.section if profile else None,
        "groups": [m.service_group.name for m in groups],
        "event_attendance": {"present": present, "absent": absent},
        "course_attendance": {"present": attended, "held": held, "percentage": round(100 * attended / held) if held else None},
    })
    return card


def messages_for(user, family, limit=50):
    """Newest first. A parent reads everything sent to the family; a child reads the family-wide ones and their own."""
    qs = FamilyMessage.objects.filter(family=family).select_related("sender", "recipient")
    if not (is_parent(user, family) or is_family_manager(user)):
        qs = qs.filter(Q(parents_only=False) & (Q(recipient__isnull=True) | Q(recipient=user)) | Q(sender=user))
    return [{
        "id": m.id, "body": m.body, "created_at": m.created_at,
        "sender": m.sender.get_full_name() if m.sender else None,
        "mine": m.sender_id == user.id,
        "to_parents": m.parents_only,
        "to": None if m.recipient_id is None else (m.recipient.get_full_name() or m.recipient.username),
    } for m in qs[:limit]]


def my_family_payload(user, family):
    """Everything the Family tab shows to this person."""
    members = [m.student for m in family.members.select_related("student__student_profile").order_by("student__first_name")]
    parent = is_parent(user, family)
    manager = is_family_manager(user)
    data = {
        "id": family.id, "name": family.name, "religious_father": family.religious_father or "",
        "member_count": len(members),
        "my_role": "parent" if parent else ("manager" if manager and user.id not in [m.id for m in members] else "child"),
        "father": person_card(family.father) if family.father else None,
        "mother": person_card(family.mother) if family.mother else None,
        "messages": messages_for(user, family),
        "can_send": True,  # parents write to the family; a child replies to the parents
    }
    if parent or manager:
        data["children"] = [child_card(m) for m in members]
        data["siblings"] = []
    else:
        data["siblings"] = [sibling_card(m) for m in members if m.id != user.id]
        data["children"] = []
    return data


def _push(user_ids, title, message):
    tokens = list(FCMDeviceToken.objects.filter(user_id__in=user_ids).values_list("device_token", flat=True))
    if not tokens:
        return
    try:
        from notifications.channels.push import _initialize_firebase, _send_fcm_multicast
        _initialize_firebase()
        _send_fcm_multicast(title=title, body=message, notification_type=Notification.TYPE_SYSTEM, device_tokens=tokens)
    except Exception:  # a broken push channel must never stop a family message
        import logging
        logging.getLogger(__name__).exception("Could not push the family message")


def send_family_message(sender, family, body, recipient=None):
    """
    Save a message and tell the people it is for (in-app, plus push when configured).
    From a father or mother: recipient=None means every child and the other parent.
    From a child: always a reply to the father and mother only.
    Returns (message, how many were told). Raises ValueError with a plain-language reason when not allowed.
    """
    body = (body or "").strip()
    if not body:
        raise ValueError("Write a message first.")
    if len(body) > MESSAGE_MAX_LENGTH:
        raise ValueError(f"The message is too long (maximum {MESSAGE_MAX_LENGTH} letters).")
    since = timezone.now() - timedelta(days=1)
    if FamilyMessage.objects.filter(sender=sender, created_at__gte=since).count() >= MESSAGES_PER_DAY:
        raise ValueError(f"You can send {MESSAGES_PER_DAY} family messages a day. Try again tomorrow.")
    member_ids = list(family.members.values_list("student_id", flat=True))
    if sender.id in member_ids and not is_parent(sender, family):
        parents = [p for p in (family.father_id, family.mother_id) if p]
        if not parents:
            raise ValueError("Your family has no father or mother yet.")
        message = FamilyMessage.objects.create(family=family, sender=sender, body=body, parents_only=True)
        title = f"Reply from {sender.get_full_name() or sender.username} ({family.name})"
        Notification.objects.bulk_create([
            Notification(user_id=uid, title=title, message=body, notification_type=Notification.TYPE_SYSTEM) for uid in parents
        ])
        _push(parents, title, body)
        return message, len(parents)
    if recipient is not None and recipient.id not in member_ids:
        raise ValueError("That person is not in this family.")
    message = FamilyMessage.objects.create(family=family, sender=sender, recipient=recipient, body=body)
    if recipient is not None:
        told = [recipient.id]
    else:
        told = member_ids + [p for p in (family.father_id, family.mother_id) if p]
    told = [uid for uid in dict.fromkeys(told) if uid != sender.id]
    title = f"Message from {sender.get_full_name() or sender.username} ({family.name})"
    Notification.objects.bulk_create([
        Notification(user_id=uid, title=title, message=body, notification_type=Notification.TYPE_SYSTEM) for uid in told
    ])
    _push(told, title, body)
    return message, len(told)
