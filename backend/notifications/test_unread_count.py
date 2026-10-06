import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from notifications.models import Notification

User = get_user_model()


@pytest.mark.django_db
def test_unread_count_counts_every_unread_and_mark_all_read_clears_all_pages():
    me = User.objects.create_user(username="a@x.com", email="a@x.com", password="x")
    other = User.objects.create_user(username="b@x.com", email="b@x.com", password="x")
    Notification.objects.bulk_create([Notification(user=me, title="t", message="m") for _ in range(45)])
    Notification.objects.create(user=other, title="t", message="m")
    c = APIClient()
    c.force_authenticate(me)
    assert c.get("/api/notifications/unread-count/").json() == {"count": 45}  # more than one page of 20
    assert c.post("/api/notifications/mark-all-read/").status_code == 200
    assert c.get("/api/notifications/unread-count/").json() == {"count": 0}
    assert Notification.objects.filter(user=other, is_read=False).count() == 1  # nobody else's are touched
