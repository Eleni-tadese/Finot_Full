import io

import pytest
from django.contrib.auth import get_user_model
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from core.models import Role, UserRole
from course.models import Course, CourseEnrollment, SemesterCourse
from student.models import AccountImportBatch, Department, StudentProfile

User = get_user_model()
BASE = "/api/admin-console/accounts/import/"
HEADERS = ["First name", "Father's name", "Grandfather's name", "Gender (M/F)", "Department", "Phone", "Dorm block", "Dorm room", "Section"]


def boss():
    user = User.objects.create_user(username="boss@x.com", email="boss@x.com", password="x", first_name="B", last_name="B")
    UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
    return User.objects.get(pk=user.pk)


def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def workbook(rows, headers=HEADERS, name="list.xlsx"):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = name
    return buf


def student_rows(n, start=0):
    return [[f"Name{start + i}", f"Father{start + i}", "Gebre", "M" if i % 2 else "F", "", f"09112{start + i:05d}", (i % 6) + 1, 100 + i, (i % 3) + 1] for i in range(n)]


@pytest.mark.django_db
class TestPreview:
    def test_template_downloads_and_is_readable(self):
        res = client(boss()).get(BASE + "template/")
        assert res.status_code == 200
        wb = load_workbook(io.BytesIO(res.content))
        assert wb.worksheets[0].cell(1, 1).value == "First name" and "Departments" in wb.sheetnames

    def test_the_template_can_be_uploaded_back_as_it_is(self):
        c = client(boss())
        content = c.get(BASE + "template/").content
        f = io.BytesIO(content)
        f.name = "students-template.xlsx"
        data = c.post(BASE + "preview/", {"file": f}, format="multipart").json()
        assert data["total"] == 2 and data["valid"] == 2

    def test_only_super_admin(self):
        stu = User.objects.create_user(username="s@x.com", email="s@x.com", password="x")
        assert client(stu).get(BASE + "template/").status_code == 403
        assert APIClient().post(BASE + "preview/").status_code == 401

    def test_preview_marks_bad_rows_and_writes_nothing(self):
        Department.objects.create(name="Law", years=5)
        rows = student_rows(2) + [
            ["", "F", "G", "M", "", "", "", "", ""],                       # missing first name
            ["A", "B", "C", "X", "", "", "", "", ""],                      # bad gender
            ["A", "B", "C", "M", "Cooking", "", "", "", ""],               # unknown department
            ["A", "B", "C", "M", "law", "12345", "", "", ""],              # bad phone
            ["A", "B", "C", "F", "Law", "+251911000111", "", "", "99999"],  # section out of range
            ["Name0", "Father0", "Gebre", "F", "", "0911200000", "", "", ""],  # same as row 2
        ]
        res = client(boss()).post(BASE + "preview/", {"file": workbook(rows)}, format="multipart")
        assert res.status_code == 200, res.json()
        data = res.json()
        assert data["total"] == 8 and data["valid"] == 2 and data["invalid"] == 6
        bad = {r["row"]: r["errors"] for r in data["rows"] if r["errors"]}
        assert set(bad) == {4, 5, 6, 7, 8, 9}
        assert User.objects.count() == 1 and not AccountImportBatch.objects.exists()

    def test_csv_aliases_and_phone_forms(self):
        csv_text = "name,father,grandfather,sex,dept,mobile\nAbel,Tesfaye,Girma,male,,+251911223344\nSelam,Yosef,Lemma,ሴት,,911223355\n"
        f = io.BytesIO(csv_text.encode("utf-8-sig"))
        f.name = "x.csv"
        data = client(boss()).post(BASE + "preview/", {"file": f}, format="multipart").json()
        assert data["valid"] == 2
        assert [r["phone"] for r in data["rows"]] == ["0911223344", "0911223355"]
        assert [r["gender"] for r in data["rows"]] == ["M", "F"]

    def test_missing_columns_and_bad_files(self):
        c = client(boss())
        res = c.post(BASE + "preview/", {"file": workbook([["a"]], headers=["First name"])}, format="multipart")
        assert res.status_code == 400 and "Missing column" in str(res.json())
        txt = io.BytesIO(b"hello")
        txt.name = "x.txt"
        assert c.post(BASE + "preview/", {"file": txt}, format="multipart").status_code == 400
        broken = io.BytesIO(b"not really a workbook")
        broken.name = "x.xlsx"
        assert c.post(BASE + "preview/", {"file": broken}, format="multipart").status_code == 400
        assert c.post(BASE + "preview/", {}, format="multipart").status_code == 400


def commit_rows(n, start=0):
    return [{"row": i + 2, "first_name": f"Name{start + i}", "middle_name": f"Father{start + i}", "last_name": "Gebre",
             "gender": "M" if i % 2 else "F", "department": "", "phone": f"09112{start + i:05d}",
             "dorm_block": (i % 6) + 1, "dorm_room": 100 + i, "section": (i % 3) + 1} for i in range(n)]


@pytest.mark.django_db
class TestCommit:
    def test_creates_students_that_can_sign_in(self):
        c = client(boss())
        res = c.post(BASE + "commit/", {"rows": commit_rows(5), "grace_days": 21}, format="json")
        assert res.status_code == 201
        data = res.json()
        assert len(data["created"]) == 5 and data["rejected"] == []
        emails = [x["email"] for x in data["created"]]
        assert len(set(emails)) == 5 and all(e.endswith("@finot.invalid") for e in emails)
        assert len({x["password"] for x in data["created"]}) == 5 and all(len(x["password"]) == 11 and x["password"] == x["password"].lower() and x["password"].isalnum() for x in data["created"])
        first = data["created"][0]
        user = User.objects.get(email=first["email"])
        assert user.check_password(first["password"]) and user.username == user.email
        p = user.student_profile
        assert p.batch_year == 1 and p.status == StudentProfile.IN_CAMPUS and p.setup_deadline is not None and p.setup_completed_at is None
        assert p.import_batch_id == data["batch_id"] and p.dorm_block and p.personal_phone
        # the sign-in works through the real login endpoint
        login = APIClient().post("/auth/jwt/create/", {"username": first["email"], "password": first["password"]}, format="json")
        assert login.status_code == 200 and "access" in login.json()

    def test_next_chunk_continues_numbering_and_batch(self):
        c = client(boss())
        a = c.post(BASE + "commit/", {"rows": commit_rows(3)}, format="json").json()
        b = c.post(BASE + "commit/", {"batch_id": a["batch_id"], "rows": commit_rows(3, start=3)}, format="json").json()
        assert b["batch_id"] == a["batch_id"] and AccountImportBatch.objects.count() == 1
        emails = sorted(x["email"] for x in a["created"] + b["created"])
        assert emails == [f"f{n:05d}@finot.invalid" for n in range(1, 7)]

    def test_retry_does_not_duplicate_and_bad_rows_are_rejected(self):
        c = client(boss())
        first = c.post(BASE + "commit/", {"rows": commit_rows(2)}, format="json").json()
        again = c.post(BASE + "commit/", {"batch_id": first["batch_id"], "rows": commit_rows(2) + [{"row": 9, "first_name": "", "gender": "M"}]}, format="json").json()
        assert again["created"] == [] and len(again["rejected"]) == 3
        assert User.objects.filter(email__endswith="@finot.invalid").count() == 2

    def test_limits_and_validation(self):
        c = client(boss())
        assert c.post(BASE + "commit/", {"rows": commit_rows(151)}, format="json").status_code == 400
        assert c.post(BASE + "commit/", {"rows": []}, format="json").status_code == 400
        assert c.post(BASE + "commit/", {"rows": commit_rows(1), "grace_days": 3}, format="json").status_code == 400
        assert c.post(BASE + "commit/", {"rows": commit_rows(1), "batch_id": 999}, format="json").status_code == 400
        assert not AccountImportBatch.objects.filter(students__isnull=False).exists()

    def test_new_students_join_the_courses_of_year_one(self):
        curriculum = Course.objects.create(title="Faith", batch_year=1)
        sc = SemesterCourse.objects.create(course=curriculum, academic_year=2026, semester=1)
        res = client(boss()).post(BASE + "commit/", {"rows": commit_rows(4)}, format="json").json()
        assert CourseEnrollment.objects.filter(semester_course=sc).count() == 4
        assert len(res["created"]) == 4

    def test_a_student_cannot_use_the_import(self):
        stu = User.objects.create_user(username="s@x.com", email="s@x.com", password="x")
        assert client(stu).post(BASE + "commit/", {"rows": commit_rows(1)}, format="json").status_code == 403


@pytest.mark.django_db
class TestBatches:
    def test_list_and_undo_removes_only_unused_accounts(self):
        c = client(boss())
        batch = c.post(BASE + "commit/", {"rows": commit_rows(3)}, format="json").json()
        used = User.objects.get(email=batch["created"][0]["email"])
        from django.utils import timezone
        User.objects.filter(pk=used.pk).update(last_login=timezone.now())
        listing = c.get(BASE + "batches/").json()["results"][0]
        assert listing["created"] == 3 and listing["signed_in"] == 1 and listing["completed"] == 0
        res = c.post(f"{BASE}batches/{batch['batch_id']}/undo/").json()
        assert res == {"deleted": 2, "kept": 1}
        assert User.objects.filter(email__endswith="@finot.invalid").count() == 1
        assert c.post(f"{BASE}batches/{batch['batch_id']}/undo/").status_code == 400
        assert c.post(f"{BASE}batches/999/undo/").status_code == 404

    def test_a_thousand_students_in_chunks(self):
        c = client(boss())
        batch_id, seen = None, set()
        for start in range(0, 1000, 100):
            body = {"rows": commit_rows(100, start)}
            if batch_id:
                body["batch_id"] = batch_id
            res = c.post(BASE + "commit/", body, format="json").json()
            batch_id = res["batch_id"]
            seen.update(x["email"] for x in res["created"])
            assert len(res["created"]) == 100
        assert len(seen) == 1000 and StudentProfile.objects.filter(import_batch_id=batch_id).count() == 1000
