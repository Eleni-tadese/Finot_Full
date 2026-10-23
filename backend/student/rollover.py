"""
The yearly "Start new year" step: every in-campus student moves up one year; students finishing the last
year of their program become graduates. Roles, groups and history are untouched.
"""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from core.models import Role

from .models import Department, StudentProfile, YearRollover

DEFAULT_YEARS = 5
MIN_DAYS_BETWEEN = 180  # a second run this soon is almost certainly a mistake


def _years_by_department():
    return {d.name.strip().lower(): d.program_length() for d in Department.objects.prefetch_related("leads_to")}


def program_years(department, table=None):
    table = table if table is not None else _years_by_department()
    return table.get((department or "").strip().lower(), DEFAULT_YEARS)


def _active_students():
    return StudentProfile.objects.filter(status=StudentProfile.IN_CAMPUS, user__is_active=True).select_related("user")


def latest_rollover():
    return YearRollover.objects.filter(undone_at__isnull=True).order_by("-performed_at").first()


def build_preview():
    table = _years_by_department()
    by_year, graduating, promote, unknown, default_dept = {}, {}, 0, 0, 0
    graduating_with_roles = []
    for p in _active_students():
        if p.batch_year is None:
            unknown += 1
            continue
        if (p.department or "").strip().lower() not in table:
            default_dept += 1
        years = program_years(p.department, table)
        row = by_year.setdefault(p.batch_year, {"year": p.batch_year, "count": 0, "graduating": 0})
        row["count"] += 1
        if p.batch_year >= years:
            row["graduating"] += 1
            key = p.department or "-"
            graduating[key] = graduating.get(key, 0) + 1
            held = list(p.user.roles.exclude(name=Role.STUDENT).values_list("name", flat=True))
            if held:
                graduating_with_roles.append({
                    "name": " ".join(x for x in (p.user.first_name, p.user.middle_name, p.user.last_name) if x) or p.user.username,
                    "roles": sorted(held),
                })
        else:
            promote += 1
    graduates = sum(r["graduating"] for r in by_year.values())
    last = latest_rollover()
    too_soon = bool(last and timezone.now() - last.performed_at < timedelta(days=MIN_DAYS_BETWEEN))
    return {
        "by_year": [by_year[k] for k in sorted(by_year)],
        "promote": promote,
        "graduate": graduates,
        "unknown_year": unknown,
        "unknown_department": default_dept,
        "graduating_by_department": [{"department": k, "count": v} for k, v in sorted(graduating.items())],
        "graduating_with_roles": graduating_with_roles,
        "too_soon": too_soon,
        "last_run_at": last.performed_at if last else None,
        "default_years": DEFAULT_YEARS,
    }


@transaction.atomic
def apply_rollover(user, label="", force=False):
    last = latest_rollover()
    if last and timezone.now() - last.performed_at < timedelta(days=MIN_DAYS_BETWEEN) and not force:
        raise ValidationError(
            f"A new year was already started on {last.performed_at:%Y-%m-%d}. Running it again so soon would move students up twice. "
            "Undo the last run first, or confirm that you really want a second one."
        )
    table = _years_by_department()
    changes, promoted, graduated, skipped = [], 0, 0, 0
    now = timezone.now()
    for p in _active_students().select_for_update(of=("self",)):
        if p.batch_year is None:
            skipped += 1
            continue
        old_batch, old_status = p.batch_year, p.status
        if p.batch_year >= program_years(p.department, table):
            p.status = StudentProfile.GRADUATED
            p.graduated_at = now
            graduated += 1
        else:
            p.batch_year += 1
            promoted += 1
        p.save(update_fields=["batch_year", "status", "graduated_at", "updated_at"])
        changes.append({"profile": str(p.pk), "batch": [old_batch, p.batch_year], "status": [old_status, p.status]})
    return YearRollover.objects.create(
        label=label.strip()[:40], performed_by=user, promoted=promoted, graduated=graduated, skipped=skipped, changes=changes,
    )


@transaction.atomic
def undo_rollover(rollover):
    """Puts back what the run changed, but only for people whose record has not been edited since."""
    if rollover.undone_at:
        raise ValidationError("This run was already undone.")
    if latest_rollover() is None or latest_rollover().pk != rollover.pk:
        raise ValidationError("Only the latest run can be undone.")
    restored = skipped = 0
    for change in rollover.changes:
        p = StudentProfile.objects.filter(pk=change["profile"]).first()
        if p is None or [p.batch_year, p.status] != [change["batch"][1], change["status"][1]]:
            skipped += 1
            continue
        p.batch_year = change["batch"][0]
        p.status = change["status"][0]
        if p.status == StudentProfile.IN_CAMPUS:
            p.graduated_at = None
        p.save(update_fields=["batch_year", "status", "graduated_at", "updated_at"])
        restored += 1
    rollover.undone_at = timezone.now()
    rollover.save(update_fields=["undone_at"])
    return {"restored": restored, "skipped": skipped}
