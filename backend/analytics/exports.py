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
    from service.event_rules import audience_label

    headers = ["Title", "Status", "Start", "End", "Place", "Service group", "Audience", "Created by"]
    rows = (
        [
            e.title, e.current_status, e.start_date, e.end_date, e.place_name,
            e.service_group.name if e.service_group else "Global",
            audience_label(e) or "Everyone",
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
        asker = full_name(q.user) if q.user and not q.anonymous else q.display_name  # anonymous: the nickname only
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


# ---- the remaining tables (Super Admin only; no passwords or secret codes are ever exported) ----

def users_sheets():
    from django.contrib.auth import get_user_model

    users = get_user_model().objects.select_related("student_profile").prefetch_related("roles").order_by("first_name", "last_name")
    headers = [
        "Full name", "Email (login)", "Gender", "Active", "Super Admin", "Roles", "Batch", "Department", "Stage",
        "Account type", "Slip deadline", "Account finished", "Joined",
    ]
    rows = []
    for u in users:
        p = getattr(u, "student_profile", None)
        if p is None:
            kind = ""
        elif p.import_batch_id:
            kind = "Slip (organization)"
        else:
            kind = "Self-registered"
        rows.append([
            full_name(u), u.email, u.gender, "Yes" if u.is_active else "No", "Yes" if u.is_superuser else "No",
            ", ".join(sorted(r.name for r in u.roles.all())),
            p.batch_year if p else "", p.department if p else "", p.status if p else "", kind,
            p.setup_deadline if p else "", p.setup_completed_at if p else "", u.date_joined,
        ])
    return [Sheet("Users and roles", headers, rows)]


def service_groups_sheets():
    from service.models import AgeglotSelection, ServiceGroup, ServiceGroupMembership

    groups = ServiceGroup.objects.select_related("admin").order_by("name")
    group_rows = [
        [g.name, full_name(g.admin) if g.admin else "", g.summary, g.activities, g.requirements, g.commitment,
         g.contact_info, g.video_url, g.created_at]
        for g in groups
    ]
    members = ServiceGroupMembership.objects.select_related("student", "service_group").order_by(
        "service_group__name", "student__first_name"
    )
    member_rows = [
        [m.service_group.name, full_name(m.student), m.student.email, m.role, m.status, m.joined_at] for m in members
    ]
    picks = AgeglotSelection.objects.select_related("student", "service_group").order_by(
        "student__first_name", "priority"
    )
    pick_rows = [
        [full_name(s.student), s.student.email, s.priority, s.service_group.name, s.skills, s.reason, s.created_at]
        for s in picks
    ]
    return [
        Sheet("Service groups", ["Group", "Admin", "Summary", "Activities", "Who should join", "Commitment", "Contact", "Video", "Created"], group_rows),
        Sheet("Members", ["Group", "Student", "Email", "Role", "Status", "Joined"], member_rows),
        Sheet("Student choices", ["Student", "Email", "Priority", "Group", "Skills", "Reason", "Chosen on"], pick_rows),
    ]


def courses_sheets():
    from course.models import AttendanceRecord, Course, CourseEnrollment, CourseSession, SemesterCourse

    courses = Course.objects.order_by("batch_year", "title")
    course_rows = [[c.title, c.batch_year, "Yes" if c.is_active else "No", c.description, c.created_at] for c in courses]
    semesters = SemesterCourse.objects.select_related("course").prefetch_related("coordinators").order_by(
        "-academic_year", "semester", "course__title"
    )
    sem_rows = [
        [s.course.title, s.course.batch_year, s.academic_year, s.semester, s.status,
         ", ".join(full_name(c) for c in s.coordinators.all()), s.created_at]
        for s in semesters
    ]
    enrol = CourseEnrollment.objects.filter(student__is_active=True).select_related("semester_course__course", "student").order_by(
        "semester_course__course__title", "student__first_name"
    )
    enrol_rows = [
        [e.semester_course.course.title, e.semester_course.academic_year, e.semester_course.semester,
         full_name(e.student), e.student.email, e.enrolled_at]
        for e in enrol
    ]
    sessions = CourseSession.objects.select_related("semester_course__course").order_by(
        "semester_course__course__title", "date"
    )
    session_rows = [
        [s.semester_course.course.title, s.semester_course.academic_year, s.semester_course.semester,
         s.date, s.topic, s.teacher_name]
        for s in sessions
    ]
    att = AttendanceRecord.objects.select_related("session__semester_course__course", "student", "marked_by").order_by(
        "session__semester_course__course__title", "session__date", "student__first_name"
    )
    att_rows = [
        [a.session.semester_course.course.title, a.session.date, full_name(a.student), a.student.email, a.status,
         full_name(a.marked_by) if a.marked_by else ""]
        for a in att
    ]
    return [
        Sheet("Curriculums", ["Title", "Batch", "Active", "Description", "Created"], course_rows),
        Sheet("Semester courses", ["Curriculum", "Batch", "Academic year", "Semester", "Status", "Coordinators", "Created"], sem_rows),
        Sheet("Enrolments", ["Curriculum", "Academic year", "Semester", "Student", "Email", "Enrolled on"], enrol_rows),
        Sheet("Class days", ["Curriculum", "Academic year", "Semester", "Date", "Topic", "Teacher"], session_rows),
        Sheet("Course attendance", ["Curriculum", "Date", "Student", "Email", "Status", "Marked by"], att_rows),
    ]


def public_qa_sheets():
    questions = (
        Question.objects.filter(visibility=Question.VISIBILITY_PUBLIC)
        .select_related("user")
        .prefetch_related("answers__responder")
        .order_by("-created_at")
    )
    headers = ["Asked on", "Asker", "Category", "Question", "Approved", "Answered by", "Answer", "Answer approved", "Answered on"]
    rows = []
    for q in questions:
        asker = full_name(q.user) if q.user and not q.anonymous else q.display_name  # anonymous: the nickname only
        approved = "Yes" if q.is_approved else "No"
        answers = list(q.answers.all())
        if not answers:
            rows.append([q.created_at, asker, q.category, q.question_body, approved, "", "", "", ""])
        for a in answers:
            rows.append([
                q.created_at, asker, q.category, q.question_body, approved,
                full_name(a.responder) if a.responder else a.display_name, a.answer_body,
                "Yes" if a.is_approved else "No", a.created_at,
            ])
    return [Sheet("Public Q&A", headers, rows)]


def materials_sheets():
    from resources.models import Material

    mats = Material.objects.select_related("course", "service_group", "uploaded_by").order_by("-created_at")
    rows = [
        [m.title, m.material_type, m.course.title if m.course else "", m.service_group.name if m.service_group else "",
         m.url or (m.file.name if m.file else ""), full_name(m.uploaded_by) if m.uploaded_by else "", m.created_at]
        for m in mats
    ]
    return [Sheet("Materials", ["Title", "Type", "Curriculum", "Service group", "Link or file", "Uploaded by", "Added"], rows)]


def setup_sheets():
    from student.models import AccountImportBatch, Department, YearRollover

    dept_rows = [[d.name, d.years, "Yes" if d.is_active else "No", d.created_at] for d in Department.objects.order_by("name")]
    roll_rows = [
        [r.label, full_name(r.performed_by) if r.performed_by else "", r.performed_at, r.promoted, r.graduated, r.skipped, r.undone_at or ""]
        for r in YearRollover.objects.select_related("performed_by").order_by("-performed_at")
    ]
    batch_rows = [
        [b.id, full_name(b.created_by) if b.created_by else "", b.created_at, b.grace_days, b.students.count(), b.undone_at or ""]
        for b in AccountImportBatch.objects.select_related("created_by").order_by("-created_at")
    ]
    return [
        Sheet("Departments", ["Department", "Years", "Active", "Created"], dept_rows),
        Sheet("Year changes", ["Academic year", "Done by", "Date", "Promoted", "Graduated", "Skipped", "Undone on"], roll_rows),
        Sheet("Registration batches", ["Batch", "Created by", "Date", "Grace days", "Students", "Undone on"], batch_rows),
    ]


SLIP_STEP_LABELS = {
    "never": "Has not signed in",
    "no_name": "Signed in, name not written",
    "on_slip": "Named, still on the slip email",
    "needs_password": "Real email set, password not changed",
    "done": "Finished",
}


def slip_progress_sheets(profiles):
    from student.slip_progress import row_for

    rows = []
    for p in profiles:
        r = row_for(p)
        rows.append([
            r["name"], r["email"], SLIP_STEP_LABELS[r["step"]], "Yes" if r["expired"] else "",
            r["deadline"], r["days_left"], r["last_login"] or "", r["batch"] or "",
        ])
    return [Sheet("Slip progress", ["Name", "Login email", "Step", "Expired", "Deadline", "Days left", "Last sign-in", "Batch"], rows)]


def sms_log_sheets():
    from notifications.models import SMSLog

    rows = [
        [s.created_at, s.phone, s.trigger, s.status, s.provider, s.error, s.message]
        for s in SMSLog.objects.order_by("-created_at")[:5000]
    ]
    return [Sheet("SMS log", ["Date", "Phone", "Trigger", "Status", "Provider", "Error", "Message"], rows)]


def everything_sheets():
    """One workbook with every table above (sheet names are unique and at most 31 characters)."""
    sheets = []
    for build in (
        users_sheets, students_sheets, service_groups_sheets, families_sheets, courses_sheets, events_sheets,
        event_attendance_sheets, donations_sheets, public_qa_sheets, private_qa_sheets, materials_sheets,
        setup_sheets, sms_log_sheets,
    ):
        sheets.extend(build())
    seen = set()
    for s in sheets:
        base, n = s.title[:31], 2
        title = base
        while title in seen:
            title = f"{base[:28]} {n}"
            n += 1
        seen.add(title)
        s.title = title
    return sheets
