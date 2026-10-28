import pytest
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import PBKDF2PasswordHasher, get_hasher

from student.account_import import quick_hash
from student.hashers import SLIP_HASH_ITERATIONS

REAL_HASHERS = [
    "student.hashers.SlipFriendlyPBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]
User = get_user_model()


def iterations(encoded):
    return int(encoded.split("$")[1])


def user_with(encoded):
    u = User.objects.create_user(username="s@x.test", email="s@x.test", password="unused")
    User.objects.filter(pk=u.pk).update(password=encoded)
    return u


@pytest.fixture(autouse=True)
def real_hashers(settings):
    settings.PASSWORD_HASHERS = REAL_HASHERS


@pytest.mark.django_db
class TestSlipHasher:
    def test_a_slip_password_signs_in_without_being_upgraded(self):
        encoded = quick_hash("abcdefghjkm")
        assert iterations(encoded) == SLIP_HASH_ITERATIONS
        u = user_with(encoded)
        assert authenticate(username="s@x.test", password="abcdefghjkm") is not None
        u.refresh_from_db()
        assert u.password == encoded  # not re-hashed: the first sign-in stays fast

    def test_a_wrong_slip_password_is_refused(self):
        user_with(quick_hash("abcdefghjkm"))
        assert authenticate(username="s@x.test", password="wrongwrong1") is None

    def test_a_weak_hash_that_is_not_a_slip_is_still_upgraded_to_full_strength(self):
        hasher = get_hasher("default")
        weak = hasher.encode("Chosen#Pass1", hasher.salt(), iterations=100000)
        u = user_with(weak)
        assert authenticate(username="s@x.test", password="Chosen#Pass1") is not None
        u.refresh_from_db()
        assert iterations(u.password) == PBKDF2PasswordHasher.iterations

    def test_a_password_the_person_chooses_is_full_strength(self):
        u = user_with(quick_hash("abcdefghjkm"))
        u.set_password("My#NewPassword9")
        u.save()
        assert iterations(u.password) == PBKDF2PasswordHasher.iterations

    def test_the_slip_hasher_is_the_default_in_the_real_settings(self):
        from django.conf import settings
        import importlib

        base = importlib.import_module("config.settings.base")
        assert base.PASSWORD_HASHERS[0] == "student.hashers.SlipFriendlyPBKDF2PasswordHasher"
        assert settings.PASSWORD_HASHERS  # the test settings use a fast hasher on purpose
