"""Pending-payment safety net, the three-way Chapa check, and the Super Admin donations list + Excel."""
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework.test import APIClient

from core.models import Role, UserRole
from donation.models import NonStudentDonation, Payment, StudentDonation
from donation.settle import recheck_pending_payments
from notifications.models import Notification

User = get_user_model()
CONSOLE = "/api/admin-console/"


class FakeChapa:
    def __init__(self, answers):
        self.answers = answers  # tx_ref -> "paid" / "unpaid" / "unknown"
        self.asked = []

    def check_payment(self, tx_ref):
        self.asked.append(tx_ref)
        return self.answers.get(tx_ref, "unpaid")


def make_user(email, role=None):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=role)[0])
    return User.objects.get(pk=user.pk)


def guest_payment(ref, amount="50.00", status=Payment.STATUS_PENDING, minutes_old=60, fund="WEEKLY", first="Guest"):
    p = Payment.objects.create(amount=Decimal(amount), transaction_reference=ref, status=status)
    Payment.objects.filter(pk=p.pk).update(created_at=timezone.now() - timedelta(minutes=minutes_old))
    NonStudentDonation.objects.create(first_name=first, last_name="Donor", email=f"{ref}@x.test", fund_category=fund, payment=p)
    return Payment.objects.get(pk=p.pk)


def student_payment(user, ref, amount="100.00", status=Payment.STATUS_COMPLETED, fund="Building Fund"):
    p = Payment.objects.create(amount=Decimal(amount), transaction_reference=ref, status=status)
    StudentDonation.objects.create(student=user, fund_category=fund, payment=p)
    return p


@pytest.mark.django_db
class TestSafetyNet:
    def test_a_paid_pending_payment_is_completed_and_the_donor_is_told(self):
        p = guest_payment("tx-paid", minutes_old=30)
        out = recheck_pending_payments(chapa=FakeChapa({"tx-paid": "paid"}))
        p.refresh_from_db()
        assert p.status == Payment.STATUS_COMPLETED and out["completed"] == 1

    def test_a_young_pending_payment_is_left_alone(self):
        p = guest_payment("tx-young", minutes_old=3)
        chapa = FakeChapa({"tx-young": "paid"})
        recheck_pending_payments(chapa=chapa)
        p.refresh_from_db()
        assert p.status == Payment.STATUS_PENDING and chapa.asked == []

    def test_unpaid_is_failed_only_after_a_day(self):
        recent = guest_payment("tx-recent", minutes_old=60 * 5)
        old = guest_payment("tx-old", minutes_old=60 * 30)
        recheck_pending_payments(chapa=FakeChapa({}))
        recent.refresh_from_db(); old.refresh_from_db()
        assert recent.status == Payment.STATUS_PENDING and old.status == Payment.STATUS_FAILED

    def test_when_chapa_cannot_be_reached_nothing_changes(self):
        old = guest_payment("tx-old", minutes_old=60 * 30)
        out = recheck_pending_payments(chapa=FakeChapa({"tx-old": "unknown"}))
        old.refresh_from_db()
        assert old.status == Payment.STATUS_PENDING and out["failed"] == 0 and out["completed"] == 0

    def test_a_payment_wrongly_marked_failed_is_corrected_when_chapa_says_paid(self):
        p = guest_payment("tx-oops", status=Payment.STATUS_FAILED, minutes_old=120)
        recheck_pending_payments(chapa=FakeChapa({"tx-oops": "paid"}))
        p.refresh_from_db()
        assert p.status == Payment.STATUS_COMPLETED

    def test_completed_payments_are_never_touched_or_asked_about(self):
        p = guest_payment("tx-done", status=Payment.STATUS_COMPLETED, minutes_old=120)
        chapa = FakeChapa({"tx-done": "unpaid"})
        recheck_pending_payments(chapa=chapa)
        p.refresh_from_db()
        assert p.status == Payment.STATUS_COMPLETED and chapa.asked == []

    def test_the_trigger_needs_the_secret(self, settings):
        settings.CRON_SECRET = "right"
        url = "/api/donations/cron/verify-pending/"
        assert APIClient().post(url, HTTP_X_CRON_TOKEN="wrong").status_code == 404
        assert APIClient().post(url).status_code == 404
        res = APIClient().post(url, HTTP_X_CRON_TOKEN="right")
        assert res.status_code == 200 and set(res.json()) == {"checked", "completed", "failed", "left"}


@pytest.mark.django_db
class TestVerifyPage:
    def test_chapa_unreachable_does_not_fail_the_payment(self, monkeypatch):
        from donation import views

        p = guest_payment("tx-net", minutes_old=1)
        monkeypatch.setattr(views.ChapaPayment, "check_payment", lambda self, ref: "unknown")
        res = APIClient().get(f"/api/donations/verify/{p.transaction_reference}/")
        p.refresh_from_db()
        assert res.status_code == 503 and p.status == Payment.STATUS_PENDING

    def test_paid_completes_and_unpaid_fails(self, monkeypatch):
        from donation import views

        ok, no = guest_payment("tx-ok", minutes_old=1), guest_payment("tx-no", minutes_old=30)
        young = guest_payment("tx-young", minutes_old=2)
        monkeypatch.setattr(views.ChapaPayment, "check_payment", lambda self, ref: "paid" if ref == "tx-ok" else "unpaid")
        assert APIClient().get("/api/donations/verify/tx-ok/").status_code == 200
        assert APIClient().get("/api/donations/verify/tx-no/").status_code == 400
        assert APIClient().get("/api/donations/verify/tx-young/").status_code == 400
        ok.refresh_from_db(); no.refresh_from_db(); young.refresh_from_db()
        assert ok.status == Payment.STATUS_COMPLETED and no.status == Payment.STATUS_FAILED
        # the donor may still be paying on Chapa's page: looking too early must not fail the payment
        assert young.status == Payment.STATUS_PENDING


@pytest.mark.django_db
class TestDonationsList:
    def setup_method(self):
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.student = make_user("stu@x.test")
        self.mod = make_user("mod@x.test", Role.QA_MODERATOR)
        student_payment(self.student, "tx-s1", "100.00", Payment.STATUS_COMPLETED, "Building Fund")
        student_payment(self.student, "tx-s2", "10.00", Payment.STATUS_COMPLETED, "Weekly Donation")
        student_payment(self.student, "tx-s3", "30.00", Payment.STATUS_FAILED, "Special Events")
        guest_payment("tx-g1", "50.00", Payment.STATUS_COMPLETED, 10, "WEEKLY", "Abel")
        guest_payment("tx-g2", "70.00", Payment.STATUS_PENDING, 10, "CHARITY", "Bete")

    def get(self, user=None, **params):
        client = APIClient()
        client.force_authenticate(user or self.boss)
        return client.get(CONSOLE + "donations/", params)

    def test_lists_students_and_guests_with_totals_of_completed_money_only(self):
        data = self.get().json()
        assert data["count"] == 5
        s = data["summary"]
        assert Decimal(str(s["collected"])) == Decimal("160.00") and s["completed"] == 3 and s["pending"] == 1 and s["failed"] == 1
        funds = {f["key"]: Decimal(str(f["amount"])) for f in s["by_fund"]}
        assert funds["building"] == 100 and funds["weekly"] == 60 and funds["charity"] == 0

    def test_filters(self):
        assert self.get(kind="guest").json()["count"] == 2
        assert self.get(kind="student").json()["count"] == 3
        assert self.get(status="PENDING").json()["count"] == 1
        assert self.get(fund="weekly").json()["count"] == 2  # a student's and a guest's weekly gift
        assert [r["donor"] for r in self.get(search="Abel").json()["results"]] == ["Abel Donor"]
        assert self.get(date_from="2999-01-01").json()["count"] == 0

    def test_rows_say_who_gave(self):
        rows = {r["reference"]: r for r in self.get().json()["results"]}
        assert rows["tx-g1"]["kind"] == "guest" and rows["tx-g1"]["fund_label"] == "Weekly donation"
        assert rows["tx-s1"]["kind"] == "student" and rows["tx-s1"]["email"] == "stu@x.test"

    def test_only_the_super_admin_sees_donations(self):
        assert self.get(self.student).status_code == 403
        assert self.get(self.mod).status_code == 403

    def test_excel_has_the_rows_and_the_totals_and_follows_the_filter(self):
        client = APIClient()
        client.force_authenticate(self.boss)
        res = client.get("/api/analytics/export/donations/", {"kind": "guest"})
        assert res.status_code == 200
        wb = load_workbook(BytesIO(res.content))
        rows = list(wb["Donations"].iter_rows(values_only=True))
        assert rows[0][1] == "Donor" and len(rows) == 3  # header + 2 guests
        summary = dict(list(wb["Summary"].iter_rows(values_only=True))[1:])
        assert summary["Pending"] == 1 and summary["Completed"] == 1
        other = APIClient()
        other.force_authenticate(self.student)
        assert other.get("/api/analytics/export/donations/").status_code == 403

    def test_overview_shows_donation_numbers(self):
        data = APIClient()
        data.force_authenticate(self.boss)
        d = data.get(CONSOLE + "overview/").json()["donations"]
        assert d["completed"] == 3 and Decimal(str(d["collected"])) == Decimal("160.00") and d["pending"] == 1


@pytest.mark.django_db
class TestOneKindOfDonation:
    URL = "/api/donations/initiate/"

    @pytest.fixture(autouse=True)
    def fake_chapa(self, monkeypatch):
        from donation import views

        self.sent = []
        monkeypatch.setattr(views.ChapaPayment, "initiate_payment", lambda s, **kw: self.sent.append(kw) or "https://checkout.example/pay")

    def test_a_visitor_can_give_with_nothing_but_an_amount(self):
        res = APIClient().post(self.URL, {"amount": "50"}, format="json")
        assert res.status_code == 201
        gift = NonStudentDonation.objects.get()
        assert gift.fund_category == NonStudentDonation.FUND_SUPPORT and gift.first_name == "" and not gift.email
        assert self.sent[0]["email"] == "" and self.sent[0]["first_name"] == ""

    def test_a_visitor_may_add_a_name_and_an_email(self):
        res = APIClient().post(self.URL, {"amount": "50", "name": "Abel K", "email": "a@x.test"}, format="json")
        assert res.status_code == 201
        gift = NonStudentDonation.objects.get()
        assert gift.first_name == "Abel K" and gift.email == "a@x.test"

    def test_a_bad_email_or_amount_is_still_refused(self):
        assert APIClient().post(self.URL, {"amount": "50", "email": "not-an-email"}, format="json").status_code == 400
        assert APIClient().post(self.URL, {"amount": "0"}, format="json").status_code == 400
        assert APIClient().post(self.URL, {"amount": "-5"}, format="json").status_code == 400
        assert APIClient().post(self.URL, {}, format="json").status_code == 400

    def test_nobody_picks_a_fund_even_if_one_is_sent(self):
        guest = APIClient().post(self.URL, {"amount": "50", "fund_category": "Weekly Donation"}, format="json")
        student = make_user("s@x.test")
        client = APIClient()
        client.force_authenticate(student)
        mine = client.post(self.URL, {"amount": "10", "fund_category": "Building Fund"}, format="json")
        assert guest.status_code == 201 and mine.status_code == 201
        assert NonStudentDonation.objects.get().fund_category == NonStudentDonation.FUND_SUPPORT  # visitors support
        assert StudentDonation.objects.get().fund_category == StudentDonation.FUND_WEEKLY  # a signed-in gift is the weekly donation

    def test_a_student_gives_with_only_an_amount_under_their_account(self):
        student = make_user("s@x.test")
        client = APIClient()
        client.force_authenticate(student)
        assert client.post(self.URL, {"amount": "10"}, format="json").status_code == 201
        gift = StudentDonation.objects.get()
        assert gift.student == student and gift.fund_category == "Weekly Donation"

    def test_the_admin_list_shows_visitors_as_support_and_students_as_weekly(self):
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        APIClient().post(self.URL, {"amount": "50"}, format="json")
        student = make_user("s@x.test")
        mine = APIClient()
        mine.force_authenticate(student)
        mine.post(self.URL, {"amount": "10"}, format="json")
        guest_payment("tx-old", "20.00", Payment.STATUS_COMPLETED, 10, "WEEKLY")  # an older record keeps its fund
        client = APIClient()
        client.force_authenticate(boss)
        rows = client.get(CONSOLE + "donations/").json()["results"]
        assert sorted(r["fund"] for r in rows) == ["support", "weekly", "weekly"]
        assert "Anonymous" in [r["donor"] for r in rows]
        assert client.get(CONSOLE + "donations/", {"fund": "support"}).json()["count"] == 1
        assert client.get(CONSOLE + "donations/", {"fund": "weekly"}).json()["count"] == 2  # the student's and an older visitor record

    def test_a_receipt_page_for_an_unnamed_visitor_says_anonymous(self, monkeypatch):
        from donation import views

        APIClient().post(self.URL, {"amount": "50"}, format="json")
        ref = Payment.objects.get().transaction_reference
        monkeypatch.setattr(views.ChapaPayment, "check_payment", lambda self, r: "paid")
        res = APIClient().get(f"/api/donations/verify/{ref}/")
        assert res.status_code == 200 and res.json()["donor_name"] == "Anonymous supporter"


@pytest.mark.django_db
class TestCheckNowButton:
    URL = CONSOLE + "donations/recheck/"

    def test_the_super_admin_settles_pending_payments_at_once(self, monkeypatch):
        from donation import settle

        paid = guest_payment("tx-paid", minutes_old=1)  # too young for the hourly job, but the button has no waiting time
        unpaid_young = guest_payment("tx-wait", minutes_old=1)
        monkeypatch.setattr(settle.ChapaPayment, "check_payment", lambda self, ref: "paid" if ref == "tx-paid" else "unpaid")
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        client = APIClient()
        client.force_authenticate(boss)
        res = client.post(self.URL)
        assert res.status_code == 200 and res.json()["completed"] == 1 and res.json()["failed"] == 0
        paid.refresh_from_db(); unpaid_young.refresh_from_db()
        assert paid.status == Payment.STATUS_COMPLETED and unpaid_young.status == Payment.STATUS_PENDING

    def test_nobody_else_can_use_it(self):
        other = APIClient()
        other.force_authenticate(make_user("s@x.test"))
        assert other.post(self.URL).status_code == 403
        assert APIClient().post(self.URL).status_code in (401, 403)
