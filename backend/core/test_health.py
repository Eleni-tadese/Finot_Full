import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_check_answers_without_signing_in():
    res = APIClient().get("/health/")
    assert res.status_code == 200 and res.json() == {"status": "ok"}
