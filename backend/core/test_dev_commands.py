import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from core.models import Role, User
from notifications.sms.phone import normalize_phone


@pytest.mark.django_db
class TestSeedPeople:
    def test_creates_accounts_without_staff_roles_by_default(self):
        call_command("seed_people", force=True, verbosity=0)
        assert User.objects.count() == 13
        yonas = User.objects.get(email="yonas@finot.test")
        assert list(yonas.roles.values_list("name", flat=True)) == [Role.STUDENT]
        assert not yonas.is_staff and yonas.check_password("Finot@12345")
        assert User.objects.filter(is_superuser=True).count() == 0

    def test_with_roles_and_freshers_and_idempotent(self):
        call_command("seed_people", "--with-roles", "--freshers", "12", force=True, verbosity=0)
        call_command("seed_people", "--with-roles", "--freshers", "12", force=True, verbosity=0)  # second run adds nothing
        assert User.objects.count() == 13 + 12
        assert User.objects.get(email="yonas@finot.test").roles.filter(name=Role.SERVICE_ADMIN).exists()
        assert User.objects.get(email="counselor@finot.test").roles.filter(name=Role.QA_COUNSELOR).exists()
        freshers = User.objects.filter(email__startswith="fresher")
        assert freshers.count() == 12 and all(u.student_profile.batch_year == 1 for u in freshers)
        assert {u.gender for u in freshers} == {"M", "F"}
        assert len({u.student_profile.dorm_block for u in freshers}) > 1  # mixed dorm blocks for the distribution test

    def test_phone_numbers_are_valid_for_sms(self):
        call_command("seed_people", force=True, verbosity=0)
        for user in User.objects.all():
            assert normalize_phone(user.student_profile.personal_phone), user.email

    def test_refuses_when_debug_is_off(self, settings):
        settings.DEBUG = False
        with pytest.raises(CommandError):
            call_command("seed_people", verbosity=0)


@pytest.mark.django_db(transaction=True)
class TestResetDevData:
    def test_needs_confirmation_and_debug(self, settings):
        with pytest.raises(CommandError, match="--yes"):
            call_command("reset_dev_data", force=True, verbosity=0)
        settings.DEBUG = False
        with pytest.raises(CommandError, match="DEBUG"):
            call_command("reset_dev_data", yes=True, verbosity=0)

    def test_wipes_everything_and_leaves_roles_and_one_super_admin(self):
        call_command("seed_people", "--with-roles", force=True, verbosity=0)
        call_command("reset_dev_data", yes=True, force=True, verbosity=0)
        assert User.objects.count() == 1
        admin = User.objects.get()
        assert admin.email == "admin@finot.test" and admin.is_superuser and admin.is_staff
        assert admin.check_password("Finot@12345")
        assert Role.objects.count() == len(Role.ROLE_CHOICES)


@pytest.mark.django_db
class TestNeutralStart:
    ARGS = ["--email", "Owner@Example.com", "--first-name", "Owner", "--middle-name", "Test",
            "--last-name", "Person", "--gender", "M", "--password", "Str0ng!Pass-2026"]

    def test_empty_reset_leaves_nothing(self):
        call_command("seed_people", force=True, verbosity=0)
        call_command("reset_dev_data", "--yes", "--empty", force=True, verbosity=0)
        assert User.objects.count() == 0 and Role.objects.count() == 0

    def test_first_admin_is_a_working_super_admin(self):
        call_command("create_first_admin", *self.ARGS, verbosity=0)
        admin = User.objects.get(email="owner@example.com")
        assert admin.check_password("Str0ng!Pass-2026") and admin.is_superuser and admin.is_staff
        assert list(admin.roles.values_list("name", flat=True)) == [Role.SUPER_ADMIN]

    def test_second_first_admin_is_refused_without_force(self):
        call_command("create_first_admin", *self.ARGS, verbosity=0)
        other = ["--email", "two@example.com", *self.ARGS[2:]]
        with pytest.raises(CommandError):
            call_command("create_first_admin", *other, verbosity=0)
        call_command("create_first_admin", *other, "--force", verbosity=0)
        assert User.objects.filter(is_superuser=True).count() == 2

    def test_weak_password_is_refused(self):
        bad = [*self.ARGS[:-1], "123"]
        with pytest.raises(CommandError):
            call_command("create_first_admin", *bad, verbosity=0)
        assert User.objects.count() == 0


@pytest.mark.django_db
class TestCreateStudents:
    def run(self, *extra):
        call_command("create_students", "--password", "Str0ng!Pass-2026", *extra, force=True, verbosity=0)

    def test_creates_the_range_with_profiles_and_no_roles(self):
        self.run("--start", "11", "--count", "20")
        assert User.objects.count() == 20
        s = User.objects.get(email="student11@finot.test")
        assert s.check_password("Str0ng!Pass-2026") and not s.is_staff and s.roles.count() == 0
        assert s.first_name == s.middle_name == s.last_name == "student11"
        assert s.student_profile.batch_year == 1 and s.student_profile.dorm_block
        assert User.objects.get(email="student30@finot.test")
        assert {u.gender for u in User.objects.all()} == {"M", "F"}

    def test_running_again_skips_existing(self):
        self.run("--start", "11", "--count", "5")
        self.run("--start", "11", "--count", "8")
        assert User.objects.count() == 8

    def test_weak_password_is_refused(self):
        with pytest.raises(CommandError):
            call_command("create_students", "--password", "123", force=True, verbosity=0)
        assert User.objects.count() == 0
