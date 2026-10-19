from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Role, UserRole
from student.account_setup import confirm_email_code, is_blocked, request_email_code, status_for
from student.test_account_setup import ACC, User, client, code_from_outbox, slip_student

USERS = "/api/admin-console/users/"


def jwt_client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION="JWT " + str(RefreshToken.for_user(user).access_token))
    return c


def confirm_real_email(user, password, email="abel@gmail.com"):
    request_email_code(user, email, password)
    confirm_email_code(user, code_from_outbox())
    user.refresh_from_db()


@pytest.mark.django_db
class TestReplaceSlipPassword:
    def test_confirming_the_email_closes_every_page_until_the_password_is_new(self):
        user, pw = slip_student(days=10)
        c = jwt_client(user)
        assert c.get("/api/notifications/").status_code == 200  # before the email: still open
        confirm_real_email(user, pw)
        assert is_blocked(user)
        st = status_for(user)
        assert st["required"] and st["must_replace_password"] and not st["expired"]
        c = jwt_client(user)
        res = c.get("/api/notifications/")
        assert res.status_code == 403 and res.json()["code"] == "account_setup_required"
        assert "password" in res.json()["detail"] and "expired" not in res.json()["detail"]
        # the Account page calls stay open so the student can fix it
        assert c.get(ACC + "status/").status_code == 200
        done = c.post(ACC + "change-password/", {"current_password": pw, "new_password": "My-Own-Pass-2024!"}, format="json")
        assert done.status_code == 200
        user.refresh_from_db()
        assert not is_blocked(user)
        assert jwt_client(user).get("/api/notifications/").status_code == 200
        assert status_for(user)["completed_at"] is not None

    def test_students_who_confirmed_before_this_rule_may_change_the_password_any_time(self):
        user, pw = slip_student(days=10)
        confirm_real_email(user, pw)
        profile = user.student_profile
        profile.email_confirmed_at = None  # how the existing accounts look
        profile.save(update_fields=["email_confirmed_at"])
        user.refresh_from_db()
        assert not is_blocked(user)
        assert jwt_client(user).get("/api/notifications/").status_code == 200
        assert status_for(user)["needs_password"] and not status_for(user)["must_replace_password"]

    def test_after_the_deadline_the_old_message_stays(self):
        user, pw = slip_student(days=10)
        confirm_real_email(user, pw)
        profile = user.student_profile
        profile.setup_deadline = timezone.now() - timedelta(days=1)
        profile.save(update_fields=["setup_deadline"])
        res = jwt_client(user).get("/api/notifications/")
        assert res.status_code == 403 and "expired" in res.json()["detail"]

    def test_students_who_never_had_a_slip_are_not_touched(self):
        user = User.objects.create_user(username="a@gmail.com", email="a@gmail.com", password="x")
        request_email_code(user, "b@gmail.com", "x")
        confirm_email_code(user, code_from_outbox())
        user.refresh_from_db()
        assert not is_blocked(user) and status_for(user) is None


@pytest.mark.django_db
class TestUsersListAccounts:
    def boss(self):
        user = User.objects.create_user(username="boss@x.com", email="boss@x.com", password="x", first_name="B", last_name="B")
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        return User.objects.get(pk=user.pk)

    def test_real_and_slip_accounts_can_be_told_apart(self):
        boss = self.boss()
        slip, _ = slip_student()
        User.objects.create_user(username="real@gmail.com", email="real@gmail.com", password="x")
        c = client(boss)
        emails = lambda **q: {u["email"] for u in c.get(USERS, q).json()["results"]}
        assert slip.email in emails()  # no filter: everyone, as before
        assert slip.email not in emails(account="real") and {"real@gmail.com", "boss@x.com"} <= emails(account="real")
        assert emails(account="slip") == {slip.email}
