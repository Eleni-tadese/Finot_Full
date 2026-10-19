import io
from datetime import timedelta

import pytest
from django.utils import timezone
from openpyxl import load_workbook

from analytics.test_account_import import User, boss, client
from student import account_import as ai
from student.models import AccountImportBatch

URL = "/api/admin-console/accounts/import/progress/"


def make_slips(n=6, days=21):
    batch = ai.start_batch(None, days)
    ai.create_blank_accounts(batch, n)
    return batch, list(User.objects.filter(student_profile__import_batch=batch).order_by("id"))


def set_up_every_step():
    """Six slips, one in each position, and the deadline of the sixth already past."""
    batch, users = make_slips(6)
    now = timezone.now()
    a, b, c, d, e, f = users
    # a: never signed in
    for u in (b, c, d, e, f):
        u.last_login = now
        u.save(update_fields=["last_login"])
    # c, d, e, f: named
    for u in (c, d, e, f):
        u.first_name, u.middle_name, u.last_name, u.gender = "N", "F", "G", "M"
        u.save(update_fields=["first_name", "middle_name", "last_name", "gender"])
    # d: real email, password not changed
    d.email = d.username = "d@real.com"
    d.save(update_fields=["email", "username"])
    # e: finished
    e.email = e.username = "e@real.com"
    e.save(update_fields=["email", "username"])
    p = e.student_profile
    p.password_changed_at = p.setup_completed_at = now
    p.save(update_fields=["password_changed_at", "setup_completed_at"])
    # f: still on the slip, deadline over
    p = f.student_profile
    p.setup_deadline = now - timedelta(days=1)
    p.save(update_fields=["setup_deadline"])
    return batch, users


@pytest.mark.django_db
class TestSlipProgress:
    def test_summary_counts_each_step_once(self):
        set_up_every_step()
        data = client(boss()).get(URL).json()
        assert data["summary"] == {"total": 6, "never": 1, "no_name": 1, "on_slip": 2, "needs_password": 1, "done": 1, "expired": 1}
        assert data["count"] == 6

    def test_summary_adds_up_to_total(self):
        set_up_every_step()
        s = client(boss()).get(URL).json()["summary"]
        assert s["never"] + s["no_name"] + s["on_slip"] + s["needs_password"] + s["done"] == s["total"]

    def test_filter_by_step_and_row_fields(self):
        _, users = set_up_every_step()
        c = client(boss())
        rows = c.get(URL, {"state": "needs_password"}).json()["results"]
        assert [r["email"] for r in rows] == ["d@real.com"] and rows[0]["step"] == "needs_password"
        rows = c.get(URL, {"state": "expired"}).json()["results"]
        assert len(rows) == 1 and rows[0]["expired"] and rows[0]["step"] == "on_slip" and rows[0]["days_left"] == 0
        assert c.get(URL, {"state": "not_done"}).json()["count"] == 5
        done = c.get(URL, {"state": "done"}).json()["results"][0]
        assert done["days_left"] == 0 and not done["expired"]

    def test_never_signed_in_row_has_no_name_but_shows_the_slip_email(self):
        set_up_every_step()
        row = client(boss()).get(URL, {"state": "never"}).json()["results"][0]
        assert row["name"] == "" and row["email"].endswith("@temp.finot") and row["last_login"] is None

    def test_search_and_batch_filter(self):
        batch, users = set_up_every_step()
        other, _ = make_slips(2)
        c = client(boss())
        assert c.get(URL, {"q": "d@real"}).json()["count"] == 1
        assert c.get(URL, {"batch": batch.id}).json()["summary"]["total"] == 6
        assert c.get(URL, {"batch": other.id}).json()["summary"]["total"] == 2
        assert c.get(URL).json()["summary"]["total"] == 8

    def test_ordinary_students_are_not_listed(self):
        set_up_every_step()
        User.objects.create_user(username="plain@x.com", email="plain@x.com", password="x")
        assert client(boss()).get(URL).json()["summary"]["total"] == 6

    def test_bad_state_is_refused(self):
        assert client(boss()).get(URL, {"state": "nope"}).status_code == 400

    def test_only_super_admin(self):
        stu = User.objects.create_user(username="s@x.com", email="s@x.com", password="x")
        assert client(stu).get(URL).status_code == 403
        assert client(stu).get(URL + "export/").status_code == 403

    def test_excel_export_follows_the_filter(self):
        set_up_every_step()
        res = client(boss()).get(URL + "export/", {"state": "not_done"})
        assert res.status_code == 200
        ws = load_workbook(io.BytesIO(res.content)).worksheets[0]
        assert ws.cell(1, 1).value == "Name" and ws.max_row == 1 + 5
