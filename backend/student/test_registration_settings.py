import pytest

from student.models import MAX_STUDY_YEAR, RegistrationSettings


@pytest.mark.django_db
class TestRegistrationSettings:
    def test_year_choice_starts_open_and_is_one_row(self):
        assert RegistrationSettings.get().allow_year_choice is True
        row = RegistrationSettings.get()
        row.allow_year_choice = False
        row.save()
        assert RegistrationSettings.objects.count() == 1
        assert RegistrationSettings.get().allow_year_choice is False

    def test_the_longest_year_is_5(self):
        assert MAX_STUDY_YEAR == 5


@pytest.mark.django_db
class TestRegistrationSettingsEndpoint:
    def test_only_the_super_admin_can_read_and_switch_it(self):
        from analytics.test_console import BASE, client_for, make_user
        from core.models import Role

        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        other = make_user("fam@x.test", Role.FAMILY_ADMIN)
        assert client_for(other).get(BASE + "registration/settings/").status_code == 403
        c = client_for(boss)
        assert c.get(BASE + "registration/settings/").json() == {"allow_year_choice": True, "max_year": 5}
        assert c.patch(BASE + "registration/settings/", {"allow_year_choice": "no"}, format="json").status_code == 400
        res = c.patch(BASE + "registration/settings/", {"allow_year_choice": False}, format="json")
        assert res.status_code == 200 and res.json()["allow_year_choice"] is False
        assert RegistrationSettings.get().allow_year_choice is False
