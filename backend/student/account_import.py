"""
Bulk registration of students from an Excel / CSV list.

The organization hands over a list; the system makes one account per student with a made-up login email and a
random password. Both stay valid for a grace period (settings.ACCOUNT_SETUP_GRACE_DAYS, default 21 days) so the
student can sign in with the printed slip; after that the student must give a real email and choose a new password.

Nothing here prints or stores a plain password except in the return value of create_accounts(), which goes straight
to the Super Admin's browser for the printed slips.
"""
import csv
import io
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import PBKDF2PasswordHasher, get_hasher, make_password
from django.db import transaction
from django.utils import timezone

from .models import AccountImportBatch, Department, StudentProfile

User = get_user_model()

LOGIN_DOMAIN = "temp.finot"  # "temp" tells everybody it is temporary; it cannot receive mail, so nothing is ever sent to it
LEGACY_LOGIN_DOMAINS = ("finot.invalid",)  # used by the very first test import; still treated as a slip address
SLIP_DOMAINS = (LOGIN_DOMAIN,) + LEGACY_LOGIN_DOMAINS
LOGIN_PATTERN = re.compile(r"^f(\d+)@(?:" + "|".join(re.escape(d) for d in SLIP_DOMAINS) + ")$")
MAX_ROWS = 3000
CHUNK_LIMIT = 150
# Slip passwords are random (about 54 bits). A lighter hash keeps a 1000-student import quick; Django re-hashes
# with the full strength at the student's first sign-in.
IMPORT_HASH_ITERATIONS = 30000
# Small letters and digits only (no capitals, no look-alikes such as l, i, o, 0, 1): easy to read from paper and to type.
# 11 characters of 31 is about 54 bits, plenty for a password that is replaced within weeks.
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PASSWORD_LENGTH = 11

# Header names we accept (lower case, spaces and punctuation removed) -> our field
HEADER_ALIASES = {
    "firstname": "first_name", "name": "first_name", "first": "first_name",
    "middlename": "middle_name", "fathername": "middle_name", "father": "middle_name", "fathersname": "middle_name",
    "lastname": "last_name", "grandfathername": "last_name", "grandfather": "last_name", "grandfathersname": "last_name",
    "gender": "gender", "sex": "gender",
    "department": "department", "dept": "department",
    "phone": "phone", "mobile": "phone", "phonenumber": "phone", "personalphone": "phone",
    "dormblock": "dorm_block", "block": "dorm_block",
    "dormroom": "dorm_room", "room": "dorm_room",
    "section": "section",
}
FIELDS = ["first_name", "middle_name", "last_name", "gender", "department", "phone", "dorm_block", "dorm_room", "section"]
TEMPLATE_HEADERS = ["First name", "Father's name", "Grandfather's name", "Gender (M/F)", "Department", "Phone", "Dorm block", "Dorm room", "Section"]
GENDER_WORDS = {"m": "M", "male": "M", "man": "M", "ወንድ": "M", "dhiira": "M", "f": "F", "female": "F", "woman": "F", "ሴት": "F", "dubartii": "F"}


def _key(header):
    text = re.sub(r"\(.*?\)", "", str(header or "").lower())  # "Gender (M/F)" -> "gender"
    return re.sub(r"[^a-z]", "", text)


def read_rows(upload):
    """Read an .xlsx or .csv upload into a list of {field: raw value} dicts (blank lines skipped)."""
    name = (getattr(upload, "name", "") or "").lower()
    data = upload.read()
    if name.endswith(".csv"):
        text = data.decode("utf-8-sig", errors="replace")
        table = list(csv.reader(io.StringIO(text)))
    elif name.endswith(".xlsx"):
        from openpyxl import load_workbook

        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).worksheets[0]
        table = [list(r) for r in sheet.iter_rows(values_only=True)]
    else:
        raise ValueError("Upload an .xlsx or .csv file.")
    if not table:
        raise ValueError("The file is empty.")
    columns = {}
    for i, header in enumerate(table[0]):
        field = HEADER_ALIASES.get(_key(header))
        if field and field not in columns.values():
            columns[i] = field
    missing = [f for f in ("first_name", "middle_name", "last_name", "gender") if f not in columns.values()]
    if missing:
        raise ValueError("Missing column(s): " + ", ".join(missing) + ". Download the template to see the headings.")
    rows = []
    for number, line in enumerate(table[1:], start=2):
        record = {field: (line[i] if i < len(line) else None) for i, field in columns.items()}
        if any(str(v).strip() for v in record.values() if v is not None):
            rows.append({"row": number, **record})
    if len(rows) > MAX_ROWS:
        raise ValueError(f"At most {MAX_ROWS} students per file.")
    if not rows:
        raise ValueError("The file has no students.")
    return rows


def _text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return re.sub(r"\s+", " ", str(value)).strip()


def _number(value, label, errors, low=1, high=999):
    raw = _text(value)
    if not raw:
        return None
    try:
        number = int(float(raw))
    except ValueError:
        errors.append(f"{label} must be a number.")
        return None
    if not low <= number <= high:
        errors.append(f"{label} must be between {low} and {high}.")
        return None
    return number


def _phone(value, errors):
    raw = re.sub(r"[\s\-()]", "", _text(value))
    if not raw:
        return ""
    if raw.startswith("+251"):
        raw = "0" + raw[4:]
    elif raw.startswith("251") and len(raw) == 12:
        raw = "0" + raw[3:]
    elif re.fullmatch(r"[79]\d{8}", raw):
        raw = "0" + raw
    if not re.fullmatch(r"0[79]\d{8}", raw):
        errors.append("Phone must look like 0911223344.")
        return ""
    return raw


def clean_rows(rows):
    """
    Check every row. Returns a list of {row, data (cleaned), errors, warnings}. Writes nothing.
    Errors keep a row out of the import; warnings (a possible duplicate) do not.
    """
    departments = {d.name.lower(): d.name for d in Department.objects.filter(is_active=True)}
    seen = {}
    existing = {}
    for profile in StudentProfile.objects.exclude(personal_phone__isnull=True).exclude(personal_phone="").select_related("user"):
        existing[(" ".join((profile.user.first_name, profile.user.middle_name, profile.user.last_name)).lower(), profile.personal_phone)] = profile.user.email
    out = []
    for raw in rows:
        errors, warnings = [], []
        data = {
            "first_name": _text(raw.get("first_name")), "middle_name": _text(raw.get("middle_name")),
            "last_name": _text(raw.get("last_name")),
        }
        for field, label in (("first_name", "First name"), ("middle_name", "Father's name"), ("last_name", "Grandfather's name")):
            if not data[field]:
                errors.append(f"{label} is required.")
            elif len(data[field]) > 150:
                errors.append(f"{label} is too long.")
        gender = GENDER_WORDS.get(_text(raw.get("gender")).lower())
        if gender is None:
            errors.append("Gender must be M or F.")
        data["gender"] = gender
        department = _text(raw.get("department"))
        if department:
            if departments and department.lower() not in departments:
                errors.append(f"Department '{department}' is not in the Departments list.")
                department = ""
            elif department.lower() in departments:
                department = departments[department.lower()]
        data["department"] = department
        data["phone"] = _phone(raw.get("phone"), errors)
        data["dorm_block"] = _number(raw.get("dorm_block"), "Dorm block", errors)
        data["dorm_room"] = _number(raw.get("dorm_room"), "Dorm room", errors, high=9999)
        data["section"] = _number(raw.get("section"), "Section", errors)
        if not errors:
            identity = (" ".join((data["first_name"], data["middle_name"], data["last_name"])).lower(), data["phone"])
            if data["phone"] and identity in seen:
                errors.append(f"Same name and phone as row {seen[identity]}.")
            else:
                seen[identity] = raw["row"]
                if data["phone"] and identity in existing:
                    warnings.append(f"Someone with this name and phone already has an account ({existing[identity]}).")
        out.append({"row": raw["row"], "data": data, "errors": errors, "warnings": warnings})
    return out


def new_password():
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def quick_hash(password):
    """Hash with fewer PBKDF2 rounds when the site uses PBKDF2 (the normal case); any other hasher is used as set up."""
    hasher = get_hasher("default")
    if type(hasher) is PBKDF2PasswordHasher:
        return hasher.encode(password, hasher.salt(), iterations=IMPORT_HASH_ITERATIONS)
    return make_password(password)


def _next_login_number():
    highest = 0
    for domain in SLIP_DOMAINS:
        for email in User.objects.filter(email__iendswith="@" + domain).values_list("email", flat=True):
            match = LOGIN_PATTERN.match(email.lower())
            if match:
                highest = max(highest, int(match.group(1)))
    return highest + 1


def grace_days():
    return int(getattr(settings, "ACCOUNT_SETUP_GRACE_DAYS", 21))


def start_batch(user, days=None):
    return AccountImportBatch.objects.create(created_by=user, grace_days=days or grace_days())


def create_accounts(batch, rows):
    """
    Create accounts for already-cleaned rows ({row, data}); the caller sends at most CHUNK_LIMIT per call.
    First-year students on campus, enrolled at once in the courses their year is studying.
    Returns [{row, name, email, password}] in the order created.
    """
    from course.enrollment import latest_semester_courses
    from course.models import CourseEnrollment

    deadline = timezone.now() + timedelta(days=batch.grace_days)
    number = _next_login_number()
    users, passwords = [], []
    for item in rows:
        d = item["data"]
        password = new_password()
        email = f"f{number:05d}@{LOGIN_DOMAIN}"
        number += 1
        users.append(User(
            username=email, email=email, first_name=d["first_name"], middle_name=d["middle_name"], last_name=d["last_name"],
            gender=d["gender"], password=quick_hash(password), is_active=True,
        ))
        passwords.append(password)
    with transaction.atomic():
        created = User.objects.bulk_create(users)  # signals do not run, so the profiles are made below
        StudentProfile.objects.bulk_create([
            StudentProfile(
                user=u, batch_year=1, status=StudentProfile.IN_CAMPUS, department=item["data"]["department"] or None,
                personal_phone=item["data"]["phone"] or None, dorm_block=item["data"]["dorm_block"],
                dorm_room=item["data"]["dorm_room"], section=item["data"]["section"],
                import_batch=batch, setup_deadline=deadline,
            ) for u, item in zip(created, rows)
        ])
        for semester_course in latest_semester_courses(1):
            CourseEnrollment.objects.bulk_create(
                [CourseEnrollment(semester_course=semester_course, student=u) for u in created], ignore_conflicts=True
            )
    return [
        {"row": item["row"], "name": " ".join((u.first_name, u.middle_name, u.last_name)), "email": u.email, "password": pw,
         "department": item["data"]["department"], "phone": item["data"]["phone"]}
        for u, item, pw in zip(created, rows, passwords)
    ]


def undo_batch(batch):
    """Delete the accounts of this import that nobody has used yet. Returns (deleted, kept)."""
    students = User.objects.filter(student_profile__import_batch=batch)
    kept = students.filter(last_login__isnull=False).count()
    unused = students.filter(last_login__isnull=True)
    deleted = unused.count()
    unused.delete()
    batch.undone_at = timezone.now()
    batch.save(update_fields=["undone_at"])
    return deleted, kept


def template_workbook():
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Students"
    ws.append(TEMPLATE_HEADERS)
    ws.append(["Abel", "Tesfaye", "Girma", "M", "", "0911223344", 2, 105, 3])
    ws.append(["Selam", "Yosef", "Lemma", "F", "", "0922334455", 4, 210, 1])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1E3A8A")
    for column, width in zip("ABCDEFGHI", (16, 18, 20, 14, 26, 16, 12, 12, 10)):
        ws.column_dimensions[column].width = width
    help_sheet = wb.create_sheet("Read me")
    for line in (
        "One row per student. The two example rows can be deleted.",
        "First name, Father's name, Grandfather's name and Gender (M or F) are required.",
        "Department must be written exactly as in the Departments list of the system (or left empty).",
        "Phone looks like 0911223344. Dorm block, dorm room and section are optional numbers.",
        "Everyone is registered as a first-year student on campus.",
    ):
        help_sheet.append([line])
    help_sheet.column_dimensions["A"].width = 110
    names = wb.create_sheet("Departments")
    names.append(["Departments you can use"])
    for name in Department.objects.filter(is_active=True).values_list("name", flat=True):
        names.append([name])
    names.column_dimensions["A"].width = 40
    return wb
