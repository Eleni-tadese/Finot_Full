"""
The donations list for the Super Admin console and the Excel export: students and guests in one table.
"""
import datetime

from django.db.models import Count, Q, Sum

from .models import NonStudentDonation, Payment, StudentDonation

# key -> (label, value in StudentDonation, value in NonStudentDonation)
FUNDS = {
    "weekly": ("Weekly donation", StudentDonation.FUND_WEEKLY, NonStudentDonation.FUND_WEEKLY),
    "building": ("Building fund", StudentDonation.FUND_BUILDING, NonStudentDonation.FUND_BUILDING),
    "charity": ("Charity", StudentDonation.FUND_CHARITY, NonStudentDonation.FUND_CHARITY),
    "special": ("Special events", StudentDonation.FUND_SPECIAL_EVENT, None),
    "other": ("Other", StudentDonation.FUND_OTHER, None),
    "support": ("Support (visitors)", None, NonStudentDonation.FUND_SUPPORT),
}
STUDENT_FUND_KEY = {student: key for key, (_, student, _g) in FUNDS.items() if student}
GUEST_FUND_KEY = {guest: key for key, (_, _s, guest) in FUNDS.items() if guest}


def guest_fund_key(value):
    """A visitor's donation: SUPPORT now; older records may hold WEEKLY / BUILDING / CHARITY or a student-style label."""
    return GUEST_FUND_KEY.get(value) or STUDENT_FUND_KEY.get(value) or "other"


def _date(value):
    try:
        return datetime.date.fromisoformat(value) if value else None
    except ValueError:
        return None


def payments_for(params):
    """Payments (with their donor) filtered by status, fund, kind (student/guest), search and dates."""
    qs = Payment.objects.select_related("student_donation__student", "guest_donation").order_by("-created_at", "-id")
    qs = qs.filter(Q(student_donation__isnull=False) | Q(guest_donation__isnull=False))

    status = (params.get("status") or "").upper()
    if status in (Payment.STATUS_PENDING, Payment.STATUS_COMPLETED, Payment.STATUS_FAILED):
        qs = qs.filter(status=status)

    kind = params.get("kind")
    if kind == "student":
        qs = qs.filter(student_donation__isnull=False)
    elif kind == "guest":
        qs = qs.filter(guest_donation__isnull=False)

    fund = params.get("fund")
    if fund in FUNDS:
        _, student_value, guest_value = FUNDS[fund]
        wanted = Q(pk__in=[])
        if student_value:
            wanted |= Q(student_donation__fund_category=student_value)
        if guest_value:
            wanted |= Q(guest_donation__fund_category=guest_value)
        qs = qs.filter(wanted)

    search = (params.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(transaction_reference__icontains=search)
            | Q(guest_donation__first_name__icontains=search)
            | Q(guest_donation__last_name__icontains=search)
            | Q(guest_donation__email__icontains=search)
            | Q(student_donation__student__first_name__icontains=search)
            | Q(student_donation__student__last_name__icontains=search)
            | Q(student_donation__student__email__icontains=search)
        )

    date_from, date_to = _date(params.get("date_from")), _date(params.get("date_to"))
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    return qs


def row(payment):
    """One line of the table."""
    student = getattr(payment, "student_donation", None)
    guest = getattr(payment, "guest_donation", None)
    if student is not None:
        user = student.student
        name = " ".join(p for p in (user.first_name, getattr(user, "middle_name", ""), user.last_name) if p) or user.username
        kind, email, fund = "student", user.email, STUDENT_FUND_KEY.get(student.fund_category, "other")
    else:
        name = f"{guest.first_name} {guest.last_name}".strip() or "Anonymous"
        kind, email, fund = "guest", guest.email or "", guest_fund_key(guest.fund_category)
    return {
        "id": payment.id,
        "date": payment.created_at,
        "donor": name,
        "kind": kind,
        "email": email,
        "fund": fund,
        "fund_label": FUNDS[fund][0],
        "amount": payment.amount,
        "currency": payment.currency,
        "status": payment.status,
        "reference": payment.transaction_reference,
    }


def summary(qs):
    """Totals for the filtered table: money collected counts only COMPLETED payments."""
    done = qs.filter(status=Payment.STATUS_COMPLETED)
    totals = done.aggregate(total=Sum("amount"), n=Count("id"))
    by_fund = {key: 0 for key in FUNDS}
    for p in done.select_related("student_donation", "guest_donation"):
        student = getattr(p, "student_donation", None)
        key = STUDENT_FUND_KEY.get(student.fund_category, "other") if student else guest_fund_key(p.guest_donation.fund_category)
        by_fund[key] += p.amount
    return {
        "collected": totals["total"] or 0,
        "completed": totals["n"] or 0,
        "pending": qs.filter(status=Payment.STATUS_PENDING).count(),
        "failed": qs.filter(status=Payment.STATUS_FAILED).count(),
        "by_fund": [{"key": k, "label": FUNDS[k][0], "amount": v} for k, v in by_fund.items()],
    }
