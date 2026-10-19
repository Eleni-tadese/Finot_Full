"""
Where every login slip stands, for the Super Admin's "Slip progress" report.

A student on a slip is in exactly one step (the first that applies):
  done            real email confirmed AND own password chosen
  never           has not signed in yet
  no_name         signed in, has not written the name / gender yet
  on_slip         named, still using the made-up slip email
  needs_password  real email set, password not changed yet
`expired` is not a step: it marks anyone not done after the deadline (they are locked out until they finish).
"""
from django.db.models import Q
from django.utils import timezone

from .account_import import SLIP_DOMAINS

STEPS = ("never", "no_name", "on_slip", "needs_password", "done")
FILTERS = STEPS + ("expired", "not_done")


def _empty(field):
    return Q(**{f"{field}__isnull": True}) | Q(**{field: ""})


def slip_profiles(batch_id=None):
    from .models import StudentProfile

    qs = StudentProfile.objects.filter(setup_deadline__isnull=False).select_related("user")
    if batch_id:
        qs = qs.filter(import_batch_id=batch_id)
    return qs


def _conditions():
    done = Q(setup_completed_at__isnull=False)
    open_ = ~done
    never = open_ & Q(user__last_login__isnull=True)
    no_name = open_ & ~never & (
        _empty("user__first_name") | _empty("user__middle_name") | _empty("user__last_name") | _empty("user__gender")
    )
    slip_email = Q()
    for domain in SLIP_DOMAINS:
        slip_email |= Q(user__email__iendswith="@" + domain)
    on_slip = open_ & ~never & ~no_name & slip_email
    needs_password = open_ & ~never & ~no_name & ~slip_email
    expired = open_ & Q(setup_deadline__lte=timezone.now())
    return {
        "done": done, "never": never, "no_name": no_name, "on_slip": on_slip,
        "needs_password": needs_password, "expired": expired, "not_done": open_,
    }


def filter_profiles(qs, state):
    if state in FILTERS:
        return qs.filter(_conditions()[state])
    return qs


def summary(qs):
    conditions = _conditions()
    out = {"total": qs.count()}
    for key in STEPS + ("expired",):
        out[key] = qs.filter(conditions[key]).count()
    return out


def step_of(profile):
    """The same rule as the filters above, for one row."""
    user = profile.user
    if profile.setup_completed_at:
        return "done"
    if user.last_login is None:
        return "never"
    if not (user.first_name and user.middle_name and user.last_name and user.gender):
        return "no_name"
    if (user.email or "").lower().endswith(tuple("@" + d for d in SLIP_DOMAINS)):
        return "on_slip"
    return "needs_password"


def row_for(profile):
    user = profile.user
    now = timezone.now()
    step = step_of(profile)
    remaining = (profile.setup_deadline - now).total_seconds()
    return {
        "id": user.id,
        "name": " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p),
        "email": user.email,
        "step": step,
        "expired": step != "done" and remaining <= 0,
        "deadline": profile.setup_deadline,
        "days_left": 0 if step == "done" else max(0, -(-int(remaining) // 86400)),
        "last_login": user.last_login,
        "batch": profile.import_batch_id,
    }
