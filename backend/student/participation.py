"""
Who counts as a student in lists, rosters, counts and distributions.

A person counts when the account is active AND is either a real email or a login slip that has signed in at
least once. A slip nobody has used yet (f00123@temp.finot, never signed in) is a printed piece of paper, not a
person: it must not appear on attendance rosters, be marked Absent, be put in a family, or be counted.

    participating_q()            on a User queryset
    participating_q("student__") from an enrolment / membership / attendance row
    participating_q("user__")    from a StudentProfile
"""
from django.db.models import Q

from .account_import import SLIP_DOMAINS


def slip_q(prefix=""):
    """The email is a made-up slip address."""
    q = Q()
    for domain in SLIP_DOMAINS:
        q |= Q(**{prefix + "email__iendswith": "@" + domain})
    return q


def participating_q(prefix=""):
    return Q(**{prefix + "is_active": True}) & ~(slip_q(prefix) & Q(**{prefix + "last_login__isnull": True}))


def is_participating(user):
    """The same rule for one loaded user, without a query."""
    if not user.is_active:
        return False
    email = (user.email or "").lower()
    on_slip = any(email.endswith("@" + d) for d in SLIP_DOMAINS)
    return not (on_slip and user.last_login is None)
