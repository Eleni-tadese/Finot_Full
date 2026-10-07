from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.account_setup_reminders import send_account_setup_reminders
from notifications.models import Notification
from student import account_import as ai
from student.models import AccountImportBatch, EmailVerification, StudentProfile

User = get_user_model()
ACC = "/api/account/"


def slip_student(days=21, password="Slip-Pass-1x"):
    batch = AccountImportBatch.objects.first() or AccountImportBatch.objects.create(grace_days=21)
    n = User.objects.filter(email__endswith="@temp.finot").count() + 1
    email = f"f{n:05d}@temp.finot"
    user = User.objects.create_user(username=email, email=email, password=password, first_name="Abel", middle_name="T", last_name="G", gender="M")
    StudentProfile.objects.filter(user=user).update(
        batch_year=1, import_batch=batch, setup_deadline=timezone.now() + timedelta(days=days))
    return User.objects.get(pk=user.pk), password


def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def code_from_outbox():
    body = mail.outbox[-1].alternatives[0][0] if mail.outbox[-1].alternatives else mail.outbox[-1].body
    import re
    return re.search(r"letter-spacing: 6px;\">(\d{6})<", body).group(1)


@pytest.mark.django_db
class TestStatusAndGate:
    def test_status_counts_days_and_asks_for_both(self):
        user, _ = slip_student(days=10)
        st = client(user).get(ACC + "status/").json()["setup"]
        assert st["pending"] and not st["required"] and st["days_left"] == 10
        assert st["needs_email"] and st["needs_password"]
        me = client(user).get("/auth/users/me/").json()
        assert me["setup"]["pending"] is True

    def test_before_the_deadline_everything_works(self):
        user, _ = slip_student(days=3)
        assert client(user).get("/api/student/profiles/me/").status_code == 200
        assert client(user).get("/api/notifications/").status_code == 200

    def test_after_the_deadline_only_the_setup_calls_open(self):
        user, _ = slip_student(days=-1)
        c = APIClient()
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(user).access_token)
        c.credentials(HTTP_AUTHORIZATION="JWT " + token)
        blocked = c.get("/api/notifications/")
        assert blocked.status_code == 403 and blocked.json()["code"] == "account_setup_required"
        assert c.get("/api/service/events/").status_code == 403
        assert c.get("/auth/users/me/").status_code == 200
        st = c.get(ACC + "status/")
        assert st.status_code == 200 and st.json()["setup"]["required"] is True

    def test_accounts_that_never_had_a_slip_are_never_blocked(self):
        user = User.objects.create_user(username="a@gmail.com", email="a@gmail.com", password="x")
        assert client(user).get("/api/notifications/").status_code == 200
        assert client(user).get(ACC + "status/").json()["setup"] is None


@pytest.mark.django_db
class TestEmailChange:
    def test_code_flow_changes_the_login_email(self, settings):
        user, pw = slip_student()
        c = client(user)
        res = c.post(ACC + "email-code/", {"email": "Abel@Gmail.com", "current_password": pw}, format="json")
        assert res.status_code == 200 and res.json()["sent_to"] == "abel@gmail.com"
        assert mail.outbox[-1].to == ["abel@gmail.com"]
        code = code_from_outbox()
        assert c.post(ACC + "confirm-email/", {"code": "000000" if code != "000000" else "111111"}, format="json").status_code == 400
        ok = c.post(ACC + "confirm-email/", {"code": code}, format="json")
        assert ok.status_code == 200
        user.refresh_from_db()
        assert user.email == user.username == "abel@gmail.com"
        # the new email signs in with the same password, the slip email no longer does
        assert APIClient().post("/auth/jwt/create/", {"username": "abel@gmail.com", "password": pw}, format="json").status_code == 200
        assert APIClient().post("/auth/jwt/create/", {"username": "f00001@temp.finot", "password": pw}, format="json").status_code == 401
        assert ok.json()["setup"]["needs_email"] is False and ok.json()["setup"]["needs_password"] is True

    def test_rules(self):
        user, pw = slip_student()
        other = User.objects.create_user(username="taken@gmail.com", email="taken@gmail.com", password="x")
        c = client(user)
        def ask(email, password=pw):
            return c.post(ACC + "email-code/", {"email": email, "current_password": password}, format="json")
        assert ask("good@gmail.com", "wrong").status_code == 400
        assert ask("not-an-email").status_code == 400
        assert ask("someone@temp.finot").status_code == 400
        assert ask("someone@finot.invalid").status_code == 400  # the older slip ending is refused too
        assert ask("x@example.com").status_code == 400            # cannot receive mail
        assert ask("TAKEN@gmail.com").status_code == 400
        assert len(mail.outbox) == 0 and not EmailVerification.objects.exists()

    def test_code_expires_and_locks_after_wrong_tries(self):
        user, pw = slip_student()
        c = client(user)
        c.post(ACC + "email-code/", {"email": "a@gmail.com", "current_password": pw}, format="json")
        code = code_from_outbox()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            assert c.post(ACC + "confirm-email/", {"code": wrong}, format="json").status_code == 400
        assert c.post(ACC + "confirm-email/", {"code": code}, format="json").status_code == 400  # locked out
        user.refresh_from_db()
        assert user.email.endswith("@temp.finot")
        c.post(ACC + "email-code/", {"email": "a@gmail.com", "current_password": pw}, format="json")
        EmailVerification.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        assert c.post(ACC + "confirm-email/", {"code": code_from_outbox()}, format="json").status_code == 400

    def test_codes_are_limited_per_hour(self):
        user, pw = slip_student()
        c = client(user)
        results = [c.post(ACC + "email-code/", {"email": f"a{i}@gmail.com", "current_password": pw}, format="json").status_code for i in range(7)]
        assert results[:5] == [200] * 5 and results[5:] == [400, 400]


@pytest.mark.django_db
class TestPasswordAndCompletion:
    def test_change_password_rules(self):
        user, pw = slip_student()
        c = client(user)
        assert c.post(ACC + "change-password/", {"current_password": "bad", "new_password": "Brand-new-9z!"}, format="json").status_code == 400
        assert c.post(ACC + "change-password/", {"current_password": pw, "new_password": pw}, format="json").status_code == 400
        assert c.post(ACC + "change-password/", {"current_password": pw, "new_password": "12345678"}, format="json").status_code == 400
        assert c.post(ACC + "change-password/", {"current_password": pw, "new_password": "short"}, format="json").status_code == 400
        ok = c.post(ACC + "change-password/", {"current_password": pw, "new_password": "Brand-new-9z!"}, format="json")
        assert ok.status_code == 200 and ok.json()["setup"]["needs_password"] is False
        user.refresh_from_db()
        assert user.check_password("Brand-new-9z!") and not user.check_password(pw)

    def test_setup_is_complete_only_when_both_are_done_and_then_the_gate_opens(self):
        user, pw = slip_student(days=-2)
        c = client(user)
        c.post(ACC + "change-password/", {"current_password": pw, "new_password": "Brand-new-9z!"}, format="json")
        assert StudentProfile.objects.get(user=user).setup_completed_at is None  # email still the slip one
        c.post(ACC + "email-code/", {"email": "abel@gmail.com", "current_password": "Brand-new-9z!"}, format="json")
        c.post(ACC + "confirm-email/", {"code": code_from_outbox()}, format="json")
        profile = StudentProfile.objects.get(user=user)
        assert profile.setup_completed_at is not None
        assert client(User.objects.get(pk=user.pk)).get("/api/notifications/").status_code == 200  # no longer blocked
        assert client(user).get(ACC + "status/").json()["setup"]["pending"] is False

    def test_any_student_can_change_their_email_and_password(self):
        user = User.objects.create_user(username="old@gmail.com", email="old@gmail.com", password="Original-1x!")
        c = client(user)
        c.post(ACC + "email-code/", {"email": "new@gmail.com", "current_password": "Original-1x!"}, format="json")
        assert c.post(ACC + "confirm-email/", {"code": code_from_outbox()}, format="json").status_code == 200
        assert c.post(ACC + "change-password/", {"current_password": "Original-1x!", "new_password": "Another-2y!"}, format="json").status_code == 200
        user.refresh_from_db()
        assert user.email == "new@gmail.com" and user.check_password("Another-2y!")


@pytest.mark.django_db
class TestRemindersAndReissue:
    def test_each_stage_is_sent_once(self):
        user, _ = slip_student(days=21)
        assert send_account_setup_reminders()["reminded"] == 0          # 21 days left: nothing yet
        StudentProfile.objects.filter(user=user).update(setup_deadline=timezone.now() + timedelta(days=13, hours=12))
        assert send_account_setup_reminders()["reminded"] == 1
        assert send_account_setup_reminders()["reminded"] == 0          # same stage: not again
        StudentProfile.objects.filter(user=user).update(setup_deadline=timezone.now() + timedelta(days=5))
        assert send_account_setup_reminders()["reminded"] == 1
        StudentProfile.objects.filter(user=user).update(setup_deadline=timezone.now() - timedelta(hours=1))
        assert send_account_setup_reminders()["reminded"] == 1
        titles = list(Notification.objects.filter(user=user).order_by("created_at").values_list("title", flat=True))
        assert len(titles) == 3 and titles[-1].startswith("Finish your account")

    def test_finished_and_other_students_get_nothing(self):
        user, _ = slip_student(days=2)
        StudentProfile.objects.filter(user=user).update(setup_completed_at=timezone.now())
        plain = User.objects.create_user(username="p@gmail.com", email="p@gmail.com", password="x")
        assert send_account_setup_reminders()["reminded"] == 0
        assert not Notification.objects.exists()

    def test_cron_endpoint_needs_the_secret(self, settings):
        settings.CRON_SECRET = "s3cret"
        slip_student(days=1)
        url = "/api/notifications/cron/account-setup-reminders/"
        assert APIClient().post(url).status_code == 404
        assert APIClient().post(url, HTTP_X_CRON_TOKEN="wrong").status_code == 404
        res = APIClient().post(url, HTTP_X_CRON_TOKEN="s3cret")
        assert res.status_code == 200 and res.json()["reminded"] == 1

    def test_reissue_gives_a_new_password_and_restarts_the_clock(self):
        boss = User.objects.create_user(username="boss@gmail.com", email="boss@gmail.com", password="x")
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        user, old = slip_student(days=-3)
        res = client(boss).post(f"/api/admin-console/users/{user.id}/reissue/")
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == user.email and data["password"] != old and data["grace_days"] == 21
        user.refresh_from_db()
        assert user.check_password(data["password"]) and not user.check_password(old)
        st = client(user).get(ACC + "status/").json()["setup"]
        assert st["required"] is False and st["days_left"] == 21 and st["needs_password"] is True
        # only the Super Admin; not for finished or ordinary accounts
        assert client(user).post(f"/api/admin-console/users/{user.id}/reissue/").status_code == 403
        StudentProfile.objects.filter(user=user).update(setup_completed_at=timezone.now())
        assert client(boss).post(f"/api/admin-console/users/{user.id}/reissue/").status_code == 400
        assert client(boss).post(f"/api/admin-console/users/{boss.id}/reissue/").status_code == 400
        assert client(boss).post("/api/admin-console/users/99999/reissue/").status_code == 404

    def test_users_list_shows_the_setup_state(self):
        boss = User.objects.create_user(username="boss@gmail.com", email="boss@gmail.com", password="x")
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        user, _ = slip_student(days=5)
        rows = client(boss).get("/api/admin-console/users/").json()["results"]
        mine = next(r for r in rows if r["id"] == user.id)
        assert mine["setup"]["pending"] is True and mine["setup"]["days_left"] == 5
        assert next(r for r in rows if r["id"] == boss.id)["setup"] is None


@pytest.mark.django_db
class TestCampusFriendlyLoginLimits:
    def test_one_account_is_limited_but_a_whole_campus_on_one_ip_is_not(self, monkeypatch):
        from django.core.cache import cache
        from rest_framework.throttling import SimpleRateThrottle

        cache.clear()
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, "login_user", "3/minute")
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, "login_ip", "50/minute")
        users = [User.objects.create_user(username=f"s{i}@gmail.com", email=f"s{i}@gmail.com", password="Right-Pass-1x") for i in range(20)]
        c = APIClient()
        # 20 different students from the same address all get in
        for u in users:
            assert c.post("/auth/jwt/create/", {"username": u.email, "password": "Right-Pass-1x"}, format="json").status_code == 200
        # one account being guessed is stopped after 3 tries a minute
        codes = [c.post("/auth/jwt/create/", {"username": "victim@gmail.com", "password": f"guess{i}"}, format="json").status_code for i in range(5)]
        assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]
        # ... and one address trying many different emails is stopped by the high ceiling
        blocked = 0
        for i in range(60):
            r = APIClient().post("/auth/jwt/create/", {"username": f"nobody{i}@gmail.com", "password": "x"}, format="json")
            blocked += r.status_code == 429
        assert blocked >= 1
        cache.clear()


@pytest.mark.django_db
class TestSlipsWithoutNames:
    BASE = "/api/admin-console/accounts/import/"

    def boss(self):
        boss = User.objects.create_user(username="boss@gmail.com", email="boss@gmail.com", password="x")
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        return User.objects.get(pk=boss.pk)

    def make(self, n=3):
        res = client(self.boss()).post(self.BASE + "blank/", {"count": n, "grace_days": 21}, format="json")
        assert res.status_code == 201
        return res.json()

    def test_blank_slips_have_no_name_and_work_for_sign_in(self):
        data = self.make(4)
        assert len(data["created"]) == 4 and all(c["name"] == "" for c in data["created"])
        assert [c["row"] for c in data["created"]] == [1, 2, 3, 4]
        first = data["created"][0]
        assert first["email"].endswith("@temp.finot") and len(first["password"]) == 11
        user = User.objects.get(email=first["email"])
        assert user.first_name == "" and user.gender is None and user.student_profile.batch_year == 1
        login = APIClient().post("/auth/jwt/create/", {"username": first["email"], "password": first["password"]}, format="json")
        assert login.status_code == 200
        user.refresh_from_db()
        assert user.last_login is not None  # the import's Undo can now tell the slip was used

    def test_limits(self):
        c = client(self.boss())
        assert c.post(self.BASE + "blank/", {"count": 0}, format="json").status_code == 400
        assert c.post(self.BASE + "blank/", {"count": 151}, format="json").status_code == 400
        assert c.post(self.BASE + "blank/", {"count": "x"}, format="json").status_code == 400
        assert client(User.objects.create_user(username="s@gmail.com", email="s@gmail.com", password="x")).post(self.BASE + "blank/", {"count": 1}, format="json").status_code == 403

    def test_the_name_must_be_written_first_and_only_once(self):
        email = self.make(1)["created"][0]["email"]
        user = User.objects.get(email=email)
        c = client(user)
        st = c.get(ACC + "status/").json()["setup"]
        assert st["needs_name"] is True and st["required"] is True and st["expired"] is False
        # every other page is closed until the name is written
        from rest_framework_simplejwt.tokens import RefreshToken
        gated = APIClient()
        gated.credentials(HTTP_AUTHORIZATION="JWT " + str(RefreshToken.for_user(user).access_token))
        assert gated.get("/api/notifications/").status_code == 403
        assert gated.get("/auth/users/me/").status_code == 200
        # rules
        def send(**kw):
            body = {"first_name": "Abel", "middle_name": "Tesfaye", "last_name": "Girma", "gender": "M", **kw}
            return c.post(ACC + "names/", body, format="json")
        assert send(first_name="  ").status_code == 400
        assert send(last_name="").status_code == 400
        assert send(gender="X").status_code == 400
        assert send(first_name="x" * 151).status_code == 400
        ok = send(first_name="  Abel   Y ")
        assert ok.status_code == 200 and ok.json()["setup"]["needs_name"] is False and ok.json()["setup"]["required"] is False
        user.refresh_from_db()
        assert (user.first_name, user.middle_name, user.last_name, user.gender) == ("Abel Y", "Tesfaye", "Girma", "M")
        assert gated.get("/api/notifications/").status_code == 200  # open now
        assert send(first_name="Other").status_code == 400  # once only
        user.refresh_from_db()
        assert user.first_name == "Abel Y"

    def test_other_students_cannot_use_the_names_call(self):
        user = User.objects.create_user(username="plain@gmail.com", email="plain@gmail.com", password="x", first_name="A", middle_name="B", last_name="C", gender="M")
        res = client(user).post(ACC + "names/", {"first_name": "Z", "middle_name": "Z", "last_name": "Z", "gender": "M"}, format="json")
        assert res.status_code == 400
        user.refresh_from_db()
        assert user.first_name == "A"

    def test_undo_keeps_slips_that_were_used(self):
        data = self.make(3)
        first = data["created"][0]
        APIClient().post("/auth/jwt/create/", {"username": first["email"], "password": first["password"]}, format="json")
        res = client(User.objects.get(email="boss@gmail.com")).post(f"{self.BASE}batches/{data['batch_id']}/undo/").json()
        assert res == {"deleted": 2, "kept": 1}


@pytest.mark.django_db
class TestSelfRegistrationIsClosedByDefault:
    BODY = {"username": "new@gmail.com", "email": "new@gmail.com", "password": "Strong-Pass-9x!", "first_name": "A", "middle_name": "B", "last_name": "C", "gender": "M"}

    def test_closed_means_nobody_can_create_an_account_by_the_public_call(self, settings):
        settings.SELF_REGISTRATION_OPEN = False
        res = APIClient().post("/auth/users/", self.BODY, format="json")
        assert res.status_code in (401, 403)  # refused (a visitor without a token is answered 401)
        assert not User.objects.filter(email="new@gmail.com").exists()
        assert APIClient().get("/api/public/registration/").json() == {"open": False}

    def test_the_owner_can_open_it(self, settings):
        settings.SELF_REGISTRATION_OPEN = True
        assert APIClient().get("/api/public/registration/").json() == {"open": True}
        assert APIClient().post("/auth/users/", self.BODY, format="json").status_code == 201

    def test_the_real_default_is_closed(self):
        import importlib
        import os
        from unittest import mock

        with mock.patch.dict(os.environ, {"SELF_REGISTRATION_OPEN": ""}):
            from config.settings import base
            importlib.reload(base)
            assert base.SELF_REGISTRATION_OPEN is False
        with mock.patch.dict(os.environ, {"SELF_REGISTRATION_OPEN": "true"}):
            importlib.reload(base)
            assert base.SELF_REGISTRATION_OPEN is True
        importlib.reload(base)
