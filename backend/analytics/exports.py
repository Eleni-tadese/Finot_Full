"""
Builders that turn querysets into Sheets for xlsx_response.

Used by both the REST export endpoints (api_views.py, JWT) and the Django admin
Reports & Exports page (admin_views.py, session). Permission checks live in the callers.
"""
from questionanswer.models import Question
from questionanswer.visibility import specialization_for
from service.models import Event, Family, ServiceAttendance
from student.models import StudentProfile

from .utils.xlsx import Sheet


def full_name(user):
    return " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p)


def students_sheets(profiles=None):
    if profiles is None:
        profiles = StudentProfile.objects.all()
    profiles = profiles.select_related("user").order_by("user__first_name", "user__last_name")
    headers = [
        "Full name", "Username", "Email", "Gender", "Batch", "Department", "Dorm block",
        "Dorm room", "Section", "Phone", "Telegram", "Status", "Confession father",
    ]
    rows = (
        [
            full_name(p.user), p.user.username, p.user.email, p.user.gender, p.batch_year,
            p.department, p.dorm_block, p.dorm_room, p.section, p.personal_phone,
            p.telegram_username, p.status, p.confession_father,
        ]
        for p in profiles
    )
    return [Sheet("Students", headers, rows)]


def families_sheets():
    families = Family.objects.select_related("father", "mother").prefetch_related("members__student")
    family_rows, member_rows = [], []
    for family in families.order_by("name"):
        members = list(family.members.all())
        family_rows.append([
            family.name, family.gender, full_name(family.father) if family.father else "",
            full_name(family.mother) if family.mother else "", family.religious_father, len(members),
        ])
        for m in members:
            member_rows.append([family.name, full_name(m.student), m.student.email, m.joined_at])
    return [
        Sheet("Families", ["Family", "Gender", "Father", "Mother", "Religious father", "Members"], family_rows),
        Sheet("Members", ["Family", "Student", "Email", "Joined"], member_rows),
    ]


def events_sheets(events=None):
    if events is None:
        events = Event.objects.all()
    events = events.select_related("service_group", "created_by").order_by("-start_date")
    headers = ["Title", "Status", "Start", "End", "Place", "Service group", "Created by"]
    rows = (
        [
            e.title, e.status, e.start_date, e.end_date, e.place_name,
            e.service_group.name if e.service_group else "Global",
            full_name(e.created_by) if e.created_by else "",
        ]
        for e in events
    )
    return [Sheet("Events", headers, rows)]


def event_attendance_sheets(records=None):
    if records is None:
        records = ServiceAttendance.objects.all()
    records = records.select_related("event", "student", "event__service_group").order_by(
        "-event__start_date", "student__first_name"
    )
    headers = ["Event", "Date", "Service group", "Student", "Email", "Status", "Remark"]
    rows = (
        [
            r.event.title, r.event.start_date,
            r.event.service_group.name if r.event.service_group else "Global",
            full_name(r.student), r.student.email, r.status, r.remark,
        ]
        for r in records
    )
    return [Sheet("Attendance", headers, rows)]


def donations_sheets(params=None):
    from donation.reports import payments_for, row, summary

    qs = payments_for(params or {})
    headers = ["Date", "Donor", "Student or guest", "Email", "Fund", "Amount", "Currency", "Status", "Reference"]
    rows = []
    for payment in qs:
        r = row(payment)
        rows.append([
            r["date"], r["donor"], "Student" if r["kind"] == "student" else "Guest", r["email"],
            r["fund_label"], r["amount"], r["currency"], r["status"].title(), r["reference"],
        ])
    s = summary(qs)
    totals = [["Collected (completed payments)", s["collected"]], ["Completed", s["completed"]], ["Pending", s["pending"]], ["Failed", s["failed"]]]
    totals += [[f"Collected: {f['label']}", f["amount"]] for f in s["by_fund"]]
    return [Sheet("Donations", headers, rows), Sheet("Summary", ["Item", "Value"], totals)]


def private_qa_sheets():
    """Log of every private question with its answers (Super Admin only: contains personal data)."""
    questions = (
        Question.objects.filter(visibility=Question.VISIBILITY_PRIVATE)
        .select_related("user")
        .prefetch_related("answers__responder", "assignments__counselor")
        .order_by("-created_at")
    )
    headers = [
        "Asked on", "Asker", "Category", "Specialization", "Question", "Assigned to",
        "Answered", "Answered by", "Answer", "Answered on",
    ]
    rows = []
    for q in questions:
        asker = full_name(q.user) if q.user else q.display_name
        assigned = ", ".join(full_name(a.counselor) or a.counselor.username for a in q.assignments.all())
        specialization = specialization_for(q.category) or "Any counselor"
        answers = list(q.answers.all())
        if not answers:
            rows.append([q.created_at, asker, q.category, specialization, q.question_body, assigned, "No", "", "", ""])
        for a in answers:
            rows.append([
                q.created_at, asker, q.category, specialization, q.question_body, assigned, "Yes",
                (full_name(a.responder) if a.responder else a.display_name), a.answer_body, a.created_at,
            ])
    return [Sheet("Private Q&A", headers, rows)]
