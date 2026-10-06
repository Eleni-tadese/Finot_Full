import io

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from service.models import AgeglotSelection, ServiceGroup, ServiceGroupMembership
from student.models import StudentProfile

User = get_user_model()
CONSOLE = "/api/admin-console/service-groups/"
GROUPS = "/api/service/groups/"


def make_user(email, *roles, batch=5):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": batch})
    for name in roles:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=name)[0])
    return User.objects.get(pk=user.pk)


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def png_bytes(size=(4, 4)):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, "blue").save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def boss():
    return make_user("boss@finot.test", Role.SUPER_ADMIN)


@pytest.mark.django_db
class TestSuperAdminManagesGroups:
    def test_create_with_info_and_admin(self, boss):
        # a brand-new group has no members yet, so it cannot have an admin yet
        person = make_user("p@finot.test")
        refused = client_for(boss).post(CONSOLE, {"name": "Early", "admin_id": person.id}, format="json")
        assert refused.status_code == 400 and "not a member" in str(refused.json())
        assert not ServiceGroup.objects.filter(name="Early").exists()
        res = client_for(boss).post(CONSOLE, {
            "name": "Choir", "summary": "We sing", "description": "Long text", "activities": "Rehearse\nSing",
            "requirements": "Love hymns", "commitment": "Saturdays", "contact_info": "Ask Abebe",
            "video_url": "https://youtube.com/watch?v=1",
        }, format="json")
        assert res.status_code == 201, res.content
        body = res.json()
        assert body["name"] == "Choir" and body["admin"] is None and body["member_count"] == 0
        ServiceGroupMembership.objects.create(student=person, service_group=ServiceGroup.objects.get(name="Choir"))
        done = client_for(boss).patch(f"{CONSOLE}{body['id']}/", {"admin_id": person.id}, format="json")
        assert done.status_code == 200 and done.json()["admin"]["id"] == person.id
        person.refresh_from_db()
        assert person.roles.filter(name=Role.SERVICE_ADMIN).exists() and person.is_staff

    def test_name_rules(self, boss):
        c = client_for(boss)
        assert c.post(CONSOLE, {"name": "  "}, format="json").status_code == 400
        assert c.post(CONSOLE, {"name": "Choir"}, format="json").status_code == 201
        assert c.post(CONSOLE, {"name": "choir"}, format="json").status_code == 400  # same name, any case

    def test_one_person_one_group_and_rollback(self, boss):
        person = make_user("p@finot.test")
        a = baker.make(ServiceGroup, name="A")
        b = baker.make(ServiceGroup, name="B")
        ServiceGroupMembership.objects.create(student=person, service_group=a)
        ServiceGroupMembership.objects.create(student=person, service_group=b)
        c = client_for(boss)
        assert c.patch(f"{CONSOLE}{a.id}/", {"admin_id": person.id}, format="json").status_code == 200
        res = c.patch(f"{CONSOLE}{b.id}/", {"summary": "x", "admin_id": person.id}, format="json")
        assert res.status_code == 400 and "already runs" in str(res.json())
        assert ServiceGroup.objects.get(pk=b.pk).summary != "x"  # nothing half-saved

    def test_edit_and_change_admin(self, boss):
        a, b = make_user("a@finot.test"), make_user("b@finot.test")
        g = baker.make(ServiceGroup, name="Media", admin=a)
        ServiceGroupMembership.objects.create(student=a, service_group=g)
        ServiceGroupMembership.objects.create(student=b, service_group=g)
        c = client_for(boss)
        res = c.patch(f"{CONSOLE}{g.id}/", {"summary": "New", "admin_id": b.id}, format="json").json()
        assert res["summary"] == "New" and res["admin"]["id"] == b.id
        assert c.patch(f"{CONSOLE}{g.id}/", {"admin_id": None}, format="json").json()["admin"] is None
        assert c.patch(f"{CONSOLE}99999/", {"summary": "x"}, format="json").status_code == 404

    def test_photo_upload_and_limits(self, boss, settings, tmp_path):
        settings.MEDIA_ROOT = tmp_path
        settings.STORAGES = {
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        }
        g = baker.make(ServiceGroup, name="Photo")
        c = client_for(boss)
        ok = c.patch(f"{CONSOLE}{g.id}/", {"photo": SimpleUploadedFile("a.png", png_bytes(), content_type="image/png")}, format="multipart")
        assert ok.status_code == 200 and ok.json()["photo"]
        bad = c.patch(f"{CONSOLE}{g.id}/", {"photo": SimpleUploadedFile("a.gif", b"GIF89a", content_type="image/gif")}, format="multipart")
        assert bad.status_code == 400
        big = SimpleUploadedFile("big.png", png_bytes() + b"\0" * (6 * 1024 * 1024), content_type="image/png")
        assert c.patch(f"{CONSOLE}{g.id}/", {"photo": big}, format="multipart").status_code == 400

    def test_bad_video_link(self, boss):
        res = client_for(boss).post(CONSOLE, {"name": "V", "video_url": "javascript:alert(1)"}, format="json")
        assert res.status_code == 400

    def test_delete_blocked_while_students_attached(self, boss):
        g = baker.make(ServiceGroup, name="Busy")
        ServiceGroupMembership.objects.create(student=make_user("m@finot.test"), service_group=g)
        res = client_for(boss).delete(f"{CONSOLE}{g.id}/")
        assert res.status_code == 400 and "member" in str(res.json())
        empty = baker.make(ServiceGroup, name="Empty")
        assert client_for(boss).delete(f"{CONSOLE}{empty.id}/").status_code == 204
        assert not ServiceGroup.objects.filter(pk=empty.pk).exists()

    def test_delete_blocked_by_student_choices(self, boss):
        g = baker.make(ServiceGroup, name="Wanted")
        AgeglotSelection.objects.create(student=make_user("s@finot.test"), service_group=g, priority=1, skills="x", reason="y")
        assert client_for(boss).delete(f"{CONSOLE}{g.id}/").status_code == 400

    def test_only_super_admin(self):
        for user in (make_user("sa@finot.test", Role.SERVICE_ADMIN), make_user("stu@finot.test")):
            c = client_for(user)
            assert c.get(CONSOLE).status_code == 403
            assert c.post(CONSOLE, {"name": "X"}, format="json").status_code == 403


@pytest.mark.django_db
class TestServiceAdminEditsOwnGroup:
    def setup_method(self):
        self.sa = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        self.mine = baker.make(ServiceGroup, name="Mine", admin=self.sa)
        self.other = baker.make(ServiceGroup, name="Other")

    def test_edits_content_of_own_group(self):
        res = client_for(self.sa).patch(f"{GROUPS}{self.mine.id}/", {"summary": "Hello", "commitment": "Weekly"}, format="json")
        assert res.status_code == 200 and res.json()["summary"] == "Hello"
        self.mine.refresh_from_db()
        assert self.mine.commitment == "Weekly"

    def test_cannot_edit_another_group(self):
        assert client_for(self.sa).patch(f"{GROUPS}{self.other.id}/", {"summary": "x"}, format="json").status_code == 403

    def test_cannot_change_name_or_admin(self):
        res = client_for(self.sa).patch(f"{GROUPS}{self.mine.id}/", {"name": "Hacked", "admin": None}, format="json")
        assert res.status_code == 200
        self.mine.refresh_from_db()
        assert self.mine.name == "Mine" and self.mine.admin_id == self.sa.id

    def test_student_cannot_edit_and_no_create_or_delete(self):
        student = make_user("stu@finot.test")
        c = client_for(student)
        assert c.patch(f"{GROUPS}{self.mine.id}/", {"summary": "x"}, format="json").status_code == 403
        assert c.post(GROUPS, {"name": "N"}, format="json").status_code == 405
        assert c.delete(f"{GROUPS}{self.mine.id}/").status_code == 405

    def test_super_admin_may_edit_via_api_too(self, boss):
        assert client_for(boss).patch(f"{GROUPS}{self.other.id}/", {"summary": "ok"}, format="json").status_code == 200


@pytest.mark.django_db
class TestStudentView:
    def test_students_see_information_and_member_count(self):
        g = baker.make(ServiceGroup, name="Choir", summary="Sing", activities="a\nb", commitment="Sat")
        ServiceGroupMembership.objects.create(student=make_user("m@finot.test"), service_group=g, status=ServiceGroupMembership.ACTIVE)
        ServiceGroupMembership.objects.create(student=make_user("i@finot.test"), service_group=g, status=ServiceGroupMembership.INACTIVE)
        data = client_for(make_user("stu@finot.test")).get(GROUPS).json()
        rows = data["results"] if isinstance(data, dict) else data
        row = rows[0]
        assert row["summary"] == "Sing" and row["commitment"] == "Sat" and row["member_count"] == 1
        detail = client_for(make_user("stu2@finot.test")).get(f"{GROUPS}{g.id}/").json()
        assert detail["activities"] == "a\nb" and "photo" in detail and "video_url" in detail


@pytest.mark.django_db
class TestPublicOverview:
    def test_no_login_needed_and_no_personal_data(self):
        baker.make(ServiceGroup, name="Choir", summary="Sing")
        res = APIClient().get("/api/public/overview/")
        assert res.status_code == 200
        data = res.json()
        assert data["groups"][0] == {"id": data["groups"][0]["id"], "name": "Choir", "summary": "Sing", "photo": None}
        assert set(data["stats"]) == {"active_students", "graduates", "service_groups", "families", "events", "public_questions"}
        assert data["stats"]["service_groups"] == 1


@pytest.mark.django_db
class TestTranslatedContent:
    def setup_method(self):
        self.sa = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        self.group = baker.make(
            ServiceGroup, name="Choir", summary="We sing", description="Main description", admin=self.sa,
            translations={"am": {"name": "መዘምራን", "summary": "እንዘምራለን"}, "om": {"name": "Faarfattoota"}},
        )
        self.student = make_user("stu@finot.test")

    def get(self, user, url, lang=None, **params):
        c = client_for(user)
        headers = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
        return c.get(url, params, **headers).json()

    def test_language_chosen_by_header_with_fallback(self):
        data = self.get(self.student, f"{GROUPS}{self.group.id}/", "am")
        assert data["name"] == "መዘምራን" and data["summary"] == "እንዘምራለን"
        assert data["description"] == "Main description"  # no Amharic description -> main text
        om = self.get(self.student, f"{GROUPS}{self.group.id}/", "om")
        assert om["name"] == "Faarfattoota" and om["summary"] == "We sing"
        for lang in (None, "en", "fr", "en-US,en;q=0.9"):
            assert self.get(self.student, f"{GROUPS}{self.group.id}/", lang)["name"] == "Choir"
        assert self.get(self.student, f"{GROUPS}{self.group.id}/", "am-ET")["name"] == "መዘምራን"

    def test_list_and_public_overview_are_localized(self):
        rows = self.get(self.student, GROUPS, "am")
        rows = rows["results"] if isinstance(rows, dict) else rows
        assert rows[0]["name"] == "መዘምራን"
        public = APIClient().get("/api/public/overview/", HTTP_ACCEPT_LANGUAGE="am").json()
        assert public["groups"][0]["name"] == "መዘምራን" and public["groups"][0]["summary"] == "እንዘምራለን"

    def test_group_name_localized_where_shown_to_students(self):
        ServiceGroupMembership.objects.create(student=self.student, service_group=self.group, status=ServiceGroupMembership.ACTIVE)
        res = client_for(self.student).get(GROUPS + "my-membership/", HTTP_ACCEPT_LANGUAGE="am").json()
        assert res["service_group_name"] == "መዘምራን"
        from service.models import Event
        baker.make(Event, service_group=self.group, status=Event.UPCOMING)
        events = client_for(self.student).get("/api/service/events/", HTTP_ACCEPT_LANGUAGE="am").json()
        events = events["results"] if isinstance(events, dict) else events
        assert events[0]["service_group_name"] == "መዘምራን"

    def test_editor_gets_main_text_and_translations_with_raw(self):
        data = self.get(self.sa, f"{GROUPS}{self.group.id}/", "am", raw=1)
        assert data["name"] == "Choir" and data["summary"] == "We sing"
        assert data["translations"]["am"]["name"] == "መዘምራን"
        # a student cannot use raw to see translations
        student_view = self.get(self.student, f"{GROUPS}{self.group.id}/", "am", raw=1)
        assert "translations" not in student_view and student_view["name"] == "መዘምራን"

    def test_service_admin_saves_translations_and_response_is_the_editable_text(self):
        res = client_for(self.sa).patch(
            f"{GROUPS}{self.group.id}/",
            {"translations": {"am": {"description": "መግለጫ", "summary": "  "}, "om": {}}}, format="json",
            HTTP_ACCEPT_LANGUAGE="am",
        )
        assert res.status_code == 200
        body = res.json()
        assert body["description"] == "Main description"  # editor response is not localized
        assert body["translations"] == {"am": {"description": "መግለጫ"}}  # blanks dropped
        self.group.refresh_from_db()
        assert self.group.translations == {"am": {"description": "መግለጫ"}}

    def test_translations_as_json_string_in_multipart(self):
        import json
        res = client_for(self.sa).patch(
            f"{GROUPS}{self.group.id}/",
            {"summary": "New", "translations": json.dumps({"om": {"summary": "Haaraa"}})}, format="multipart",
        )
        assert res.status_code == 200
        self.group.refresh_from_db()
        assert self.group.translations == {"om": {"summary": "Haaraa"}} and self.group.summary == "New"

    def test_invalid_translations_rejected(self):
        c = client_for(self.sa)
        url = f"{GROUPS}{self.group.id}/"
        for bad in (
            {"fr": {"summary": "x"}}, {"am": {"video_url": "x"}}, {"am": {"summary": "x" * 201}},
            {"am": "text"}, {"am": {"summary": 5}}, "[1, 2]", "not json",
        ):
            assert c.patch(url, {"translations": bad}, format="json").status_code == 400, bad

    def test_super_admin_creates_group_with_translations(self, boss):
        res = client_for(boss).post(CONSOLE, {"name": "Media", "translations": {"am": {"name": "ሚዲያ"}}}, format="json")
        assert res.status_code == 201 and res.json()["translations"] == {"am": {"name": "ሚዲያ"}}
        listed = client_for(boss).get(CONSOLE, HTTP_ACCEPT_LANGUAGE="am").json()
        assert next(g for g in listed if g["name"] == "Media")  # console always shows the main name


@pytest.mark.django_db
class TestApplicantsAndMembers:
    def setup_method(self):
        self.sa = make_user("sa@finot.test", Role.SERVICE_ADMIN)
        self.choir = baker.make(ServiceGroup, name="Choir", admin=self.sa)
        self.media = baker.make(ServiceGroup, name="Media")
        self.s1, self.s2 = make_user("s1@finot.test"), make_user("s2@finot.test")
        AgeglotSelection.objects.create(student=self.s1, service_group=self.choir, priority=1, skills="Sings", reason="Love it")
        AgeglotSelection.objects.create(student=self.s2, service_group=self.choir, priority=2, skills="", reason="")
        AgeglotSelection.objects.create(student=self.s1, service_group=self.media, priority=2, skills="", reason="")
        self.url = f"{GROUPS}{self.choir.id}/"

    def test_applicants_listed_with_choices_for_own_admin(self):
        data = client_for(self.sa).get(self.url + "applicants/").json()
        assert [a["email"] for a in data["applicants"]] == ["s1@finot.test", "s2@finot.test"]  # first choices first
        first = data["applicants"][0]
        assert first["priority"] == 1 and first["skills"] == "Sings" and first["reason"] == "Love it" and first["current_groups"] == [] and first["at_limit"] is False
        assert data["members"] == []

    def test_accept_creates_membership_and_notifies(self):
        from notifications.models import Notification
        c = client_for(self.sa)
        assert c.post(self.url + "add-member/", {"student_id": self.s1.id}, format="json").status_code == 201
        assert ServiceGroupMembership.objects.get(student=self.s1).service_group_id == self.choir.id
        assert Notification.objects.filter(user=self.s1, title__icontains="Welcome").count() == 1
        data = c.get(self.url + "applicants/").json()
        assert [m["email"] for m in data["members"]] == ["s1@finot.test"]
        assert [a["email"] for a in data["applicants"]] == ["s2@finot.test"]  # accepted student leaves the applicant list

    def test_a_student_can_be_in_two_groups_but_not_the_same_one_twice(self):
        c = client_for(self.sa)
        c.post(self.url + "add-member/", {"student_id": self.s1.id}, format="json")
        # the second group's admin (super admin here) can take the same student: two groups are allowed
        boss = client_for(make_user("boss@finot.test", Role.SUPER_ADMIN))
        media = boss.get(f"{GROUPS}{self.media.id}/applicants/").json()
        assert media["applicants"][0]["current_groups"] == [{"id": self.choir.id, "name": "Choir"}]
        assert media["applicants"][0]["at_limit"] is False
        assert boss.post(f"{GROUPS}{self.media.id}/add-member/", {"student_id": self.s1.id}, format="json").status_code == 201
        assert ServiceGroupMembership.objects.filter(student=self.s1).count() == 2
        # same group twice
        again = c.post(self.url + "add-member/", {"student_id": self.s1.id}, format="json")
        assert again.status_code == 400 and "already a member of this group" in str(again.json())

    def test_a_third_group_is_refused_with_the_names_of_the_two(self):
        from service.group_rules import MAX_GROUPS_PER_STUDENT
        assert MAX_GROUPS_PER_STUDENT == 2
        boss = client_for(make_user("boss@finot.test", Role.SUPER_ADMIN))
        third = baker.make(ServiceGroup, name="Charity")
        AgeglotSelection.objects.create(student=self.s1, service_group=third, priority=3)
        for g in (self.choir, self.media):
            assert boss.post(f"{GROUPS}{g.id}/add-member/", {"student_id": self.s1.id}, format="json").status_code == 201
        res = boss.post(f"{GROUPS}{third.id}/add-member/", {"student_id": self.s1.id}, format="json")
        assert res.status_code == 400 and "at most 2" in str(res.json()) and "Choir" in str(res.json())
        applicant = boss.get(f"{GROUPS}{third.id}/applicants/").json()["applicants"][0]
        assert applicant["at_limit"] is True and len(applicant["current_groups"]) == 2

    def test_student_sees_every_group_they_belong_to(self):
        boss = client_for(make_user("boss@finot.test", Role.SUPER_ADMIN))
        for g in (self.choir, self.media):
            boss.post(f"{GROUPS}{g.id}/add-member/", {"student_id": self.s1.id}, format="json")
        mine = client_for(self.s1).get(f"{GROUPS}my-membership/").json()
        assert {m["service_group_name"] for m in mine["memberships"]} == {"Choir", "Media"} and mine["max_groups"] == 2
        from service.models import Event
        from django.utils import timezone
        for g in (self.choir, self.media):
            baker.make(Event, title=f"{g.name} meeting", service_group=g, start_date=timezone.now(), end_date=timezone.now())
        titles = {e["title"] for e in client_for(self.s1).get("/api/service/events/").json()["results"]}
        assert {"Choir meeting", "Media meeting"} <= titles

    def test_remove_member(self):
        c = client_for(self.sa)
        c.post(self.url + "add-member/", {"student_id": self.s1.id}, format="json")
        assert c.post(self.url + "remove-member/", {"student_id": self.s1.id}, format="json").status_code == 200
        assert not ServiceGroupMembership.objects.filter(student=self.s1).exists()
        assert c.post(self.url + "remove-member/", {"student_id": self.s1.id}, format="json").status_code == 404

    def test_only_this_groups_admin_or_super_admin(self):
        other_admin = client_for(make_user("sa2@finot.test", Role.SERVICE_ADMIN))
        for call in (other_admin.get(self.url + "applicants/"),
                     other_admin.post(self.url + "add-member/", {"student_id": self.s1.id}, format="json"),
                     other_admin.post(self.url + "remove-member/", {"student_id": self.s1.id}, format="json"),
                     client_for(self.s1).get(self.url + "applicants/")):
            assert call.status_code == 403
        assert client_for(make_user("boss@finot.test", Role.SUPER_ADMIN)).get(self.url + "applicants/").status_code == 200

    def test_validation(self):
        c = client_for(self.sa)
        assert c.post(self.url + "add-member/", {"student_id": "x"}, format="json").status_code == 400
        assert c.post(self.url + "add-member/", {"student_id": 99999}, format="json").status_code == 400

    def test_accepted_student_is_listed_by_the_existing_members_endpoint_and_my_membership(self):
        client_for(self.sa).post(self.url + "add-member/", {"student_id": self.s1.id}, format="json")
        members = client_for(self.sa).get(self.url + "members/").json()
        assert [m["email"] for m in members] == ["s1@finot.test"]
        mine = client_for(self.s1).get(GROUPS + "my-membership/").json()
        assert mine["service_group_id"] == self.choir.id
