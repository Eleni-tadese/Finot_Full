"""
Regression tests: Service/Family Admins are is_staff but must NOT get
Super Admin powers over Q&A, student profiles or events.
"""
import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from questionanswer.models import Question
from service.models import Event

User = get_user_model()


def make_user(email, role_name=None):
    user = User.objects.create_user(
        username=email, email=email, password="Pass@12345", first_name="T", last_name="U"
    )
    if role_name:
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.create(user=user, role=role)
        user.refresh_from_db()
    return user


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
class TestServiceAdminIsNotSuperAdmin:
    def test_signal_gives_staff_but_not_superuser(self):
        admin = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        assert admin.is_staff and not admin.is_superuser
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        assert boss.is_staff and boss.is_superuser

    def test_service_admin_cannot_read_counselor_queue(self):
        baker.make(Question, visibility=Question.VISIBILITY_PRIVATE)
        res = client_for(make_user("sa@finot.test", Role.SERVICE_ADMIN)).get(
            "/api/qa/questions/counselor-queue/"
        )
        assert res.status_code == 403

    def test_counselor_and_superuser_can_read_counselor_queue(self):
        for email, role in (("c@finot.test", Role.QA_COUNSELOR), ("s@finot.test", Role.SUPER_ADMIN)):
            res = client_for(make_user(email, role)).get("/api/qa/questions/counselor-queue/")
            assert res.status_code == 200

    def test_service_admin_cannot_list_or_delete_profiles(self):
        admin = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        other = make_user("stu@finot.test")
        client = client_for(admin)
        listed = client.get("/api/student/profiles/").json()
        rows = listed["results"] if isinstance(listed, dict) else listed
        assert len(rows) <= 1  # only own profile, if any
        profile = other.profile if hasattr(other, "profile") else None
        if profile is not None:
            assert client.delete(f"/api/student/profiles/{profile.pk}/").status_code in (403, 404)

    def test_superuser_can_list_all_profiles(self):
        make_user("stu@finot.test")
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        listed = client_for(boss).get("/api/student/profiles/").json()
        rows = listed["results"] if isinstance(listed, dict) else listed
        assert len(rows) >= 2

    def test_service_admin_cannot_edit_others_event(self):
        admin = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        event = baker.make(Event, created_by=make_user("em@finot.test", Role.EVENT_MANAGER))
        res = client_for(admin).patch(f"/api/service/events/{event.pk}/", {"title": "x"}, format="json")
        assert res.status_code in (403, 404)


@pytest.mark.django_db
class TestEventManagerOwnEventsOnly:
    def setup_method(self):
        self.em = make_user("em1@finot.test", Role.EVENT_MANAGER)
        self.other = make_user("em2@finot.test", Role.EVENT_MANAGER)
        self.mine = baker.make(Event, created_by=self.em, service_group=None, title="mine")
        self.theirs = baker.make(Event, created_by=self.other, service_group=None, title="theirs")
        self.client = client_for(self.em)

    def test_cannot_edit_or_delete_others_event(self):
        url = f"/api/service/events/{self.theirs.pk}/"
        assert self.client.patch(url, {"title": "x"}, format="json").status_code == 403
        assert self.client.delete(url).status_code == 403

    def test_can_edit_own_event(self):
        res = self.client.patch(f"/api/service/events/{self.mine.pk}/", {"title": "new"}, format="json")
        assert res.status_code == 200

    def test_my_events_lists_only_own(self):
        data = self.client.get("/api/service/events/my-events/").json()
        rows = data["results"] if isinstance(data, dict) else data
        assert [r["title"] for r in rows] == ["mine"]

    def test_superuser_can_still_edit_any(self):
        boss = client_for(make_user("boss@finot.test", Role.SUPER_ADMIN))
        res = boss.patch(f"/api/service/events/{self.theirs.pk}/", {"title": "y"}, format="json")
        assert res.status_code == 200


@pytest.mark.django_db
class TestAttendancePresentAbsentOnly:
    def test_status_choices(self):
        from service.models import ServiceAttendance
        from course.models import AttendanceRecord
        assert [c[0] for c in ServiceAttendance.STATUS_CHOICES] == ["PRESENT", "ABSENT"]
        assert [c[0] for c in AttendanceRecord.STATUS_CHOICES] == ["PRESENT", "ABSENT"]

    def test_old_statuses_rejected_by_bulk_mark(self):
        admin = make_user("boss@finot.test", Role.SUPER_ADMIN)
        event = baker.make(Event)
        stu = make_user("stu@finot.test")
        res = client_for(admin).post(
            "/api/service/attendance/mark/",
            {"event_id": event.pk, "records": [{"student_id": stu.pk, "status": "LATE"}]},
            format="json",
        )
        assert res.status_code == 400
