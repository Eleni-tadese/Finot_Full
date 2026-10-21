"""
Charts (Step 6) and simple predictions (Step 7) for organizers, coordinators and students.

No machine learning. The "prediction" is the average attendance rate of the last three counted sessions applied
to the roster of the next one; "at risk" is a person on the roster with no Present at any of the last three
counted sessions. A session is "counted" when at least one Present/Absent row exists for it.

    event_insights(user, scope, group_id)        events the user may take attendance for (service.event_rules)
    course_insights(user, semester_course)       class days of one course (course.access decides who may see it)
    my_insights(user)                            the student's own months and streak
"""
from collections import defaultdict
from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone

from course.models import AttendanceRecord, CourseEnrollment, CourseSession
from service.event_rules import attendance_roster, can_manage_event_attendance, person_name
from service.models import Event, ServiceAttendance

LAST_N = 3
MAX_EVENTS = 12
MAX_AT_RISK = 100


def _rate(present, roster):
    return round(present * 100 / roster, 1) if roster else 0.0


def _person(user):
    profile = getattr(user, "student_profile", None)
    return {
        "id": user.id, "name": person_name(user),
        "batch_year": getattr(profile, "batch_year", None), "department": getattr(profile, "department", None),
    }


def _estimate(counted, roster):
    """Average rate of the last counted sessions, applied to the next roster."""
    if not counted:
        return None, None
    avg = round(sum(r["rate"] for r in counted) / len(counted), 1)
    return avg, round(roster * avg / 100)


def event_insights(user, scope="all", group_id=None, limit=MAX_EVENTS):
    """Rows for the last `limit` started events the user may manage, the at-risk list and the next event's estimate."""
    now = timezone.now()
    qs = Event.objects.select_related("service_group").order_by("start_date")
    if scope == "mine":
        qs = qs.filter(service_group=None)
    elif scope == "group":
        qs = qs.filter(service_group__isnull=False)
        if group_id:
            qs = qs.filter(service_group_id=group_id)
    events = [e for e in qs if can_manage_event_attendance(user, e)]
    past = [e for e in events if e.start_date <= now][-limit:]
    upcoming = [e for e in events if e.start_date > now]

    counts = {
        row["event_id"]: row
        for row in ServiceAttendance.objects.filter(event__in=past).values("event_id").annotate(
            present=Count("id", filter=Q(status=ServiceAttendance.PRESENT)),
            absent=Count("id", filter=Q(status=ServiceAttendance.ABSENT)),
        )
    }
    rows = []
    for event in past:
        c = counts.get(event.id, {"present": 0, "absent": 0})
        roster = attendance_roster(event).count()
        rows.append({
            "id": event.id, "title": event.title, "date": event.start_date,
            "group": event.service_group.name if event.service_group_id else None,
            "roster": roster, "present": c["present"], "absent": c["absent"],
            "unmarked": max(roster - c["present"] - c["absent"], 0),
            "rate": _rate(c["present"], roster), "counted": (c["present"] + c["absent"]) > 0,
        })
    counted = [r for r in rows if r["counted"]][-LAST_N:]

    at_risk = []
    if counted:
        latest = next(e for e in past if e.id == counted[-1]["id"])
        present_ids = set(
            ServiceAttendance.objects.filter(event_id__in=[r["id"] for r in counted], status=ServiceAttendance.PRESENT)
            .values_list("student_id", flat=True)
        )
        at_risk = [_person(u) for u in attendance_roster(latest) if u.id not in present_ids]

    nxt = None
    if upcoming:
        event = upcoming[0]
        roster = attendance_roster(event).count()
        avg, expected = _estimate(counted, roster)
        nxt = {
            "id": event.id, "title": event.title, "date": event.start_date, "roster": roster,
            "expected_rate": avg, "expected_present": expected, "based_on": len(counted),
        }
    return {
        "events": rows, "at_risk": at_risk[:MAX_AT_RISK], "at_risk_total": len(at_risk),
        "next": nxt, "average_rate": _estimate(counted, 0)[0], "last_n": LAST_N,
    }


def course_insights(semester_course, limit=MAX_EVENTS):
    """Rows per marked class day (last `limit`), the at-risk list and the next planned day's estimate."""
    today = timezone.localdate()
    enrolled = list(
        CourseEnrollment.objects.filter(semester_course=semester_course, student__is_active=True)
        .select_related("student__student_profile")
        .order_by("student__first_name", "student__last_name", "student_id")
    )
    roster = len(enrolled)
    sessions = list(
        CourseSession.objects.filter(semester_course=semester_course)
        .annotate(
            present=Count("attendance_records", filter=Q(attendance_records__status="PRESENT")),
            absent=Count("attendance_records", filter=Q(attendance_records__status="ABSENT")),
        )
        .order_by("date")
    )
    marked = [s for s in sessions if s.present + s.absent > 0][-limit:]
    rows = [{
        "id": str(s.id), "date": s.date, "topic": s.topic or "", "roster": roster,
        "present": s.present, "absent": s.absent, "unmarked": max(roster - s.present - s.absent, 0),
        "rate": _rate(s.present, roster), "counted": True,
    } for s in marked]
    counted = rows[-LAST_N:]

    at_risk = []
    if counted:
        present_ids = set(
            AttendanceRecord.objects.filter(session_id__in=[r["id"] for r in counted], status="PRESENT")
            .values_list("student_id", flat=True)
        )
        at_risk = [_person(e.student) for e in enrolled if e.student_id not in present_ids]

    nxt = None
    planned = [s for s in sessions if s.present + s.absent == 0 and s.date >= today]
    if planned:
        s = planned[0]
        avg, expected = _estimate(counted, roster)
        nxt = {
            "id": str(s.id), "title": s.topic or "", "date": s.date, "roster": roster,
            "expected_rate": avg, "expected_present": expected, "based_on": len(counted),
        }
    return {
        "events": rows, "at_risk": at_risk[:MAX_AT_RISK], "at_risk_total": len(at_risk),
        "next": nxt, "average_rate": _estimate(counted, 0)[0], "last_n": LAST_N,
    }


def my_insights(user, months=6):
    """The student's own Present/Absent per month (events and classes) and the current streak of Present at events."""
    first = timezone.localdate().replace(day=1)
    for _ in range(months - 1):  # walk back month by month (months have different lengths)
        first = (first - timedelta(days=1)).replace(day=1)
    buckets = defaultdict(lambda: {"events_present": 0, "events_absent": 0, "classes_present": 0, "classes_absent": 0})
    for status, when in ServiceAttendance.objects.filter(student=user, event__start_date__date__gte=first).values_list(
        "status", "event__start_date"
    ):
        key = when.date().strftime("%Y-%m")
        buckets[key]["events_present" if status == ServiceAttendance.PRESENT else "events_absent"] += 1
    for status, when in AttendanceRecord.objects.filter(student=user, session__date__gte=first).values_list(
        "status", "session__date"
    ):
        key = when.strftime("%Y-%m")
        buckets[key]["classes_present" if status == "PRESENT" else "classes_absent"] += 1

    out = []
    cursor = first
    today = timezone.localdate()
    while cursor <= today:
        key = cursor.strftime("%Y-%m")
        out.append({"month": key, **buckets[key]})
        cursor = (cursor + timedelta(days=32)).replace(day=1)

    streak = 0
    for status in ServiceAttendance.objects.filter(student=user).order_by("-event__start_date").values_list("status", flat=True):
        if status != ServiceAttendance.PRESENT:
            break
        streak += 1
    return {"months": out, "streak": streak}


def month_label(key):
    """'2026-10' -> date(2026, 10, 1), for callers that want a real date."""
    y, m = key.split("-")
    return date(int(y), int(m), 1)
