"""A sign-in with an email that does not exist must be refused at once, without the slow full-strength hash."""
import pytest
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import make_password
from unittest import mock

User = get_user_model()


@pytest.mark.django_db
class TestUnknownLogin:
    def test_unknown_email_is_refused_without_hashing(self):
        with mock.patch("django.contrib.auth.models.User.set_password", create=True) as slow, \
             mock.patch("django.contrib.auth.hashers.make_password") as slow2:
            assert authenticate(username="nobody@example.com", password="x") is None
        assert not slow.called and not slow2.called

    def test_real_account_still_signs_in(self):
        User.objects.create(username="a@b.com", email="a@b.com", password=make_password("Right-pass-1!"))
        assert authenticate(username="a@b.com", password="Right-pass-1!") is not None
        assert authenticate(username="a@b.com", password="wrong") is None
