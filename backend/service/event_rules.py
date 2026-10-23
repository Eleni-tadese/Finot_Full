"""
Events: who may take attendance, who is on the attendance list, who hears about an event, and how its time is shown.

  * A general event (no service group) belongs to the people everyone follows, like a channel announcement:
    it is made by an Event Manager (or the Super Admin) and goes to every active user.
  * A group event belongs to one service group: it is made by that group's Service Admin (or the Super Admin)
    and goes only to that group's active members.
  * Attendance: the Event Manager takes it for the general events they made, the Service Admin for their group's
    events, the Super Admin for any event.
"""
from django.db.models import Q
from datetime import timedelta, timezone as dt_timezone

from django.contrib.auth import get_user_model

from core.models import Role
from student.models import StudentProfile

from .models import ServiceGroupMembership

User = get_user_model()

ETHIOPIA = dt_timezone(timedelta(hours=3))  # no daylight saving


def has_role(user, name):
    return bool(user and user.is_authenticated and user.roles.filter(name=name).exists())


def is_super_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or has_role(user, Role.SUPER_ADMIN)))


def person_name(user):
    return " ".join(p for p in (user.first_name, getattr(user, "middle_name", ""), user.last_name) if p) or user.username


def can_manage_event_attendance(user, event):
    """May this person take (and change) attendance for this event?"""
    if is_super_admin(user):
        return True
    if event.service_group_id is None:
        return has_role(user, Role.EVENT_MANAGER) and event.created_by_id == user.id
    return has_role(user, Role.SERVICE_ADMIN) and user.managed_service_groups.filter(pk=event.service_group_id).exists()


def audience_q(event):
    """Filter on User for the event's audience. An empty audience matches everyone."""
    from functools import reduce
    from operator import or_

    q = Q()
    if event.audience_years:
        q &= Q(student_profile__batch_year__in=[int(y) for y in event.audience_years])
    if event.audience_gender:
        q &= Q(gender=event.audience_gender)
    if event.audience_departments:
        q &= reduce(or_, [Q(student_profile__department__iexact=str(d).strip()) for d in event.audience_departments])
    return q


def matches_audience(user, event):
    """The same rule for one person, without a query (used to filter a student's event list)."""
    profile = getattr(user, "student_profile", None)
    if event.audience_years and (profile is None or profile.batch_year not in [int(y) for y in event.audience_years]):
        return False
    if event.audience_gender and user.gender != event.audience_gender:
        return False
    if event.audience_departments:
        mine = (getattr(profile, "department", None) or "").strip().lower()
        if mine not in [str(d).strip().lower() for d in event.audience_departments]:
            return False
    return True


def audience_label(event):
    """'Year 1, 2 · Women · Software Engineering' or '' for everyone (English; the website builds its own)."""
    parts = []
    if event.audience_years:
        parts.append("Year " + ", ".join(str(y) for y in sorted(int(y) for y in event.audience_years)))
    if event.audience_gender:
        parts.append("Women" if event.audience_gender == "F" else "Men")
    if event.audience_departments:
        parts.append(", ".join(str(d) for d in event.audience_departments))
    return " · ".join(parts)


def attendance_roster(event):
    """The people whose attendance can be taken: active in-campus students (general) or active members (group)."""
    if event.service_group_id:
        qs = User.objects.filter(
            is_active=True,
            service_memberships__service_group_id=event.service_group_id,
            service_memberships__status=ServiceGroupMembership.ACTIVE,
        ).exclude(student_profile__status=StudentProfile.GRADUATED)
    else:
        qs = User.objects.filter(is_active=True, student_profile__status=StudentProfile.IN_CAMPUS)
    qs = qs.filter(audience_q(event))
    return qs.select_related("student_profile").distinct().order_by("first_name", "middle_name", "last_name", "id")


def notification_audience(event):
    """Everyone who should be told about a new event: all active users, or only the group's active members."""
    qs = User.objects.filter(is_active=True)
    if event.service_group_id:
        qs = qs.filter(
            service_memberships__service_group_id=event.service_group_id,
            service_memberships__status=ServiceGroupMembership.ACTIVE,
        )
    return qs.filter(audience_q(event)).distinct()


def _clock(moment):
    return moment.strftime("%I:%M %p").lstrip("0")


def format_when(event):
    """'Sunday, 11 October 2026, 2:00 PM - 5:00 PM' in Ethiopian time, whatever the server clock says."""
    start = event.start_date.astimezone(ETHIOPIA)
    text = f"{start:%A, %d %B %Y}, {_clock(start)}"
    end = event.end_date.astimezone(ETHIOPIA) if event.end_date else None
    if end and end != start:
        text += f" - {_clock(end)}" if end.date() == start.date() else f" - {end:%A, %d %B %Y}, {_clock(end)}"
    return text
