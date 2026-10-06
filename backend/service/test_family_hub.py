import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.models import Notification
from service.models import Event, Family, FamilyMembership, FamilyMessage, ServiceAttendance
from student.models import StudentProfile

User = get_user_model()
MINE = "/api/service/families/my-family/"
SEND = "/api/service/families/my-family/messages/"


def person(email, gender="F", year=1, phone="0911000000", **profile):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T", gender=gender)
    StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": year, "personal_phone": phone, "department": "Law", **profile})
    return User.objects.get(pk=user.pk)


def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def world():
    dad, mum = person("dad@x.com", "M", 5), person("mum@x.com", "F", 5)
    family = Family.objects.create(name="Family 1", father=dad, mother=mum)
    kids = [person(f"kid{i}@x.com", "F" if i % 2 else "M", 1, f"09110000{i}", dorm_block=2, section=3) for i in range(3)]
    for k in kids:
        FamilyMembership.objects.create(family=family, student=k)
    other = Family.objects.create(name="Family 2")
    stranger = person("stranger@x.com", "M", 1)
    FamilyMembership.objects.create(family=other, student=stranger)
    return family, dad, mum, kids, other, stranger


@pytest.mark.django_db
class TestWhatEachPersonSees:
    def test_parent_sees_children_cards_with_attendance(self, world):
        family, dad, mum, kids, *_ = world
        event = Event.objects.create(title="E", description="d", start_date="2026-10-01T10:00:00Z", end_date="2026-10-01T12:00:00Z", created_by=dad)
        ServiceAttendance.objects.create(event=event, student=kids[0], status=ServiceAttendance.PRESENT)
        ServiceAttendance.objects.create(event=Event.objects.create(title="E2", description="d", start_date="2026-10-02T10:00:00Z", end_date="2026-10-02T12:00:00Z", created_by=dad), student=kids[0], status=ServiceAttendance.ABSENT)
        data = client(dad).get(MINE).json()
        assert data["my_role"] == "parent" and data["can_send"] is True and data["siblings"] == []
        assert len(data["children"]) == 3
        card = next(c for c in data["children"] if c["id"] == kids[0].id)
        assert card["event_attendance"] == {"present": 1, "absent": 1}
        assert card["email"] == "kid0@x.com" and card["dorm_block"] == 2 and card["section"] == 3
        assert "course_attendance" in card and "groups" in card
        assert client(mum).get(MINE).json()["my_role"] == "parent"

    def test_child_sees_parents_and_slim_siblings(self, world):
        family, dad, mum, kids, *_ = world
        data = client(kids[0]).get(MINE).json()
        assert data["my_role"] == "child" and data["can_send"] is False and data["children"] == []
        assert data["father"]["email"] == "dad@x.com" and data["mother"]["phone"] == "0911000000"
        assert sorted(s["id"] for s in data["siblings"]) == sorted([kids[1].id, kids[2].id])  # not themselves
        assert set(data["siblings"][0]) == {"id", "name", "year", "department", "phone"}  # no email, dorm or attendance

    def test_no_family_is_404(self, world):
        assert client(person("lonely@x.com")).get(MINE).status_code == 404


@pytest.mark.django_db
class TestMessages:
    def test_parent_sends_to_everyone_children_get_it_not_the_sender(self, world):
        family, dad, mum, kids, *_ = world
        res = client(dad).post(SEND, {"body": "Come to church on Sunday"}, format="json")
        assert res.status_code == 201 and res.json()["told"] == 4  # three children and the mother
        assert Notification.objects.filter(user=kids[0], message="Come to church on Sunday").exists()
        assert Notification.objects.filter(user=mum).exists() and not Notification.objects.filter(user=dad).exists()
        assert client(kids[1]).get(MINE).json()["messages"][0]["body"] == "Come to church on Sunday"

    def test_message_to_one_child_is_private_to_that_child(self, world):
        family, dad, mum, kids, *_ = world
        res = client(mum).post(SEND, {"body": "Call me", "to_student_id": kids[0].id}, format="json")
        assert res.status_code == 201 and res.json()["told"] == 1
        assert [m["body"] for m in client(kids[0]).get(MINE).json()["messages"]] == ["Call me"]
        assert client(kids[1]).get(MINE).json()["messages"] == []
        assert [m["body"] for m in client(dad).get(MINE).json()["messages"]] == ["Call me"]  # the other parent sees all

    def test_children_and_strangers_cannot_send(self, world):
        family, dad, mum, kids, other, stranger = world
        assert client(kids[0]).post(SEND, {"body": "hi"}, format="json").status_code == 403
        assert FamilyMessage.objects.count() == 0

    def test_rules(self, world):
        family, dad, mum, kids, other, stranger = world
        c = client(dad)
        assert c.post(SEND, {"body": "  "}, format="json").status_code == 400
        assert c.post(SEND, {"body": "x" * 1001}, format="json").status_code == 400
        assert c.post(SEND, {"body": "hi", "to_student_id": stranger.id}, format="json").status_code == 400  # other family
        assert c.post(SEND, {"body": "hi", "to_student_id": "abc"}, format="json").status_code == 400
        for _ in range(20):
            assert c.post(SEND, {"body": "hello"}, format="json").status_code == 201
        assert c.post(SEND, {"body": "one too many"}, format="json").status_code == 400


@pytest.mark.django_db
class TestFamiliesAreNotOpenToEveryone:
    def test_a_student_cannot_read_another_family(self, world):
        family, dad, mum, kids, other, stranger = world
        c = client(stranger)
        assert c.get(f"/api/service/families/{family.id}/").status_code == 404
        assert c.get(f"/api/service/families/{family.id}/members/").status_code == 404
        listed = c.get("/api/service/families/").json()
        rows = listed["results"] if isinstance(listed, dict) else listed
        assert [r["id"] for r in rows] == [other.id]

    def test_a_child_cannot_list_members_but_parent_and_admin_can(self, world):
        family, dad, mum, kids, *_ = world
        url = f"/api/service/families/{family.id}/members/"
        assert client(kids[0]).get(url).status_code == 403
        assert client(dad).get(url).status_code == 200
        boss = person("boss@x.com")
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.FAMILY_ADMIN)[0])
        assert client(boss).get(url).status_code == 200
        assert client(boss).get(MINE, {"family_id": family.id}).json()["my_role"] == "manager"
