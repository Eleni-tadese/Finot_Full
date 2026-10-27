"""
Who may hold which role, by year of study. A graduate is always eligible (graduates are the fellowship's
long-term members: counselors, moderators, family fathers and mothers). The Super Admin role and roles not listed
here have no year rule.
"""
from django.core.exceptions import ValidationError

from .models import Role

# Minimum year of study for each role.
MIN_YEAR = {
    Role.SERVICE_ADMIN: 2,
    Role.EVENT_MANAGER: 2,
    Role.COURSE_COORDINATOR: 2,
    Role.FAMILY_ADMIN: 2,
    Role.QA_COUNSELOR: 3,
    Role.QA_MODERATOR: 3,
}
# Leading a family as its father or mother.
FAMILY_LEADER_MIN_YEAR = 2


def _name(user):
    return " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p) or user.username


def _check(user, minimum, what):
    profile = getattr(user, "student_profile", None)
    if profile is not None and profile.status == "GRADUATED":
        return
    year = profile.batch_year if profile else None
    if year is None:
        raise ValidationError(
            f"{_name(user)} has no year of study on record. Set it first (Users & roles, Edit details); {what} needs year {minimum} or above, or a graduate."
        )
    if year < minimum:
        raise ValidationError(f"{_name(user)} is in year {year}. {what} needs year {minimum} or above, or a graduate.")


def check_role_eligibility(user, role_name):
    """Raises django ValidationError with a readable message when `user` may not hold `role_name`."""
    minimum = MIN_YEAR.get(role_name)
    if minimum is None:
        return
    label = dict(Role.ROLE_CHOICES).get(role_name, role_name)
    _check(user, minimum, label)


def check_family_leader(user):
    _check(user, FAMILY_LEADER_MIN_YEAR, "A family father or mother")
