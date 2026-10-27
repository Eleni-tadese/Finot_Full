"""
A student who signs in with a printed slip may choose their own year once (1 to MAX_STUDY_YEAR), while the Super Admin
keeps "allow year choice" on (RegistrationSettings). When it is off, or after the choice, the year is locked as
before and only the Super Admin changes it. The choice is trusted: no approval (the Super Admin can correct it).
"""
from .models import RegistrationSettings, StudentProfile


def may_choose_year(profile):
    return bool(
        profile is not None
        and profile.import_batch_id is not None  # an account made from a slip
        and profile.year_chosen_at is None
        and profile.status == StudentProfile.IN_CAMPUS
        and RegistrationSettings.get().allow_year_choice
    )
