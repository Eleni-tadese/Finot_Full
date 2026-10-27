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
