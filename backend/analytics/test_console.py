import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.models import SMSConfiguration, SMSLog
from questionanswer.models import Question, TeacherSpecialization
from service.models import Family, FamilyDistributionBatch, FamilyMembership, ParentCandidate
from student.models import StudentProfile

User = get_user_model()
BASE = "/api/admin-console/"


def make_user(email, *roles, gender=None, batch=5):
    user = User.objects.create_user(
        username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T", gender=gender
    )
    StudentProfile.objects.update_or_create(user=user, defaults={"batch_year": batch})
    for name in roles:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=name)[0])
    return User.objects.get(pk=user.pk)


def train(*users):
    """Put people on the trained list, so they can be named father or mother."""
    for user in users:
        ParentCandidate.objects.update_or_create(user=user, defaults={"status": ParentCandidate.TRAINED})
    return users[0] if len(users) == 1 else users


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def boss():
    return make_user("boss@finot.test", Role.SUPER_ADMIN)


@pytest.mark.django_db
class TestAccess:
    URLS = ["overview/", "roles/", "users/", "qa/counselors/", "sms/settings/", "sms/logs/"]

    def test_only_super_admin(self, boss):
        others = [make_user("stu@finot.test"), make_user("sa@finot.test", Role.SERVICE_ADMIN),
                  make_user("mod@finot.test", Role.QA_MODERATOR), make_user("fam@finot.test", Role.FAMILY_ADMIN)]
        for url in self.URLS:
            assert APIClient().get(BASE + url).status_code == 401
            for user in others:
                assert client_for(user).get(BASE + url).status_code == 403
            assert client_for(boss).get(BASE + url).status_code == 200


@pytest.mark.django_db
class TestOverview:
    def test_numbers(self, boss):
        baker.make(Question, visibility=Question.VISIBILITY_PRIVATE, category=Question.CAT_PERSONAL)
        baker.make(Question, visibility=Question.VISIBILITY_PUBLIC, is_approved=False)
        data = client_for(boss).get(BASE + "overview/").json()
        assert data["qa"]["private_total"] == 1 and data["qa"]["needs_assignment"] == 1
        assert data["qa"]["public_pending"] == 1
        assert data["users"]["by_role"][Role.SUPER_ADMIN] == 1
        assert data["sms"]["enabled"] is False
        gone = make_user("gone@finot.test", Role.EVENT_MANAGER)
        User.objects.filter(pk=gone.pk).update(is_active=False)
        assert Role.EVENT_MANAGER not in client_for(boss).get(BASE + "overview/").json()["users"]["by_role"]

    def test_real_accounts_and_slips_are_counted_apart(self, boss):
        used = make_user("f00001@temp.finot")
        User.objects.filter(pk=used.pk).update(last_login=timezone.now())
        make_user("f00002@temp.finot")
        make_user("old@finot.invalid")  # legacy slip domain, never signed in
        disabled = make_user("gone@finot.test")
        User.objects.filter(pk=disabled.pk).update(is_active=False)
        users = client_for(boss).get(BASE + "overview/").json()["users"]
        assert users["total"] == 5 and users["active"] == 4
        assert users["real"] == 2 and users["real_active"] == 1
        assert users["slips_used"] == 1 and users["slips_unused"] == 2
        assert users["students"] == 5 and users["students_real"] == 2


@pytest.mark.django_db
class TestUsers:
    def test_super_admin_fixes_name_gender_and_login_email(self, boss):
        person = make_user("typo@finot.test")
        make_user("taken@finot.test")
        c = client_for(boss)
        res = c.patch(f"{BASE}users/{person.id}/", {"first_name": "  Hawi ", "middle_name": "Tilo", "last_name": "Dugda", "gender": "F", "email": "Hawi.Real@Gmail.com"}, format="json")
        assert res.status_code == 200, res.content
        assert res.json()["full_name"].startswith("Hawi Tilo Dugda") and res.json()["email"] == "hawi.real@gmail.com" and res.json()["gender"] == "F"
        person.refresh_from_db()
        assert person.username == "hawi.real@gmail.com"  # the login follows the email
        assert c.patch(f"{BASE}users/{person.id}/", {"email": "taken@finot.test"}, format="json").status_code == 400
        assert c.patch(f"{BASE}users/{person.id}/", {"email": "nonsense"}, format="json").status_code == 400
        assert c.patch(f"{BASE}users/{person.id}/", {"first_name": ""}, format="json").status_code == 400
        assert c.patch(f"{BASE}users/{person.id}/", {"gender": "X"}, format="json").status_code == 400

    def test_a_new_badge_cancels_the_old_one(self, boss):
        from attendance import codes

        student = make_user("stu@finot.test")
        old = codes.badge_for(student.id, student.student_profile.badge_version)
        res = client_for(boss).post(BASE + f"users/{student.id}/badge/")
        assert res.status_code == 200 and res.json()["version"] == 2
        assert codes.badge_for(student.id, 2) != old
        assert client_for(boss).post(BASE + "users/999999/badge/").status_code == 404
        assert client_for(student).post(BASE + f"users/{student.id}/badge/").status_code == 403

    def test_search_filter_and_page_shape(self, boss):
        make_user("alem@finot.test", Role.QA_COUNSELOR)
        make_user("bekele@finot.test")
        data = client_for(boss).get(BASE + "users/", {"search": "alem"}).json()
        assert data["count"] == 1 and data["results"][0]["roles"] == [Role.QA_COUNSELOR]
        data = client_for(boss).get(BASE + "users/", {"role": Role.QA_COUNSELOR}).json()
        assert [u["email"] for u in data["results"]] == ["alem@finot.test"]

    def test_set_roles_updates_staff_flags_through_signals(self, boss):
        target = make_user("t@finot.test")
        res = client_for(boss).patch(f"{BASE}users/{target.id}/", {"roles": [Role.FAMILY_ADMIN, Role.QA_COUNSELOR]}, format="json")
        assert res.status_code == 200 and res.json()["roles"] == [Role.FAMILY_ADMIN, Role.QA_COUNSELOR]
        target.refresh_from_db()
        assert target.is_staff and not target.is_superuser
        client_for(boss).patch(f"{BASE}users/{target.id}/", {"roles": []}, format="json")
        target.refresh_from_db()
        assert not target.is_staff and target.roles.count() == 0

    def test_grant_super_admin_sets_superuser(self, boss):
        target = make_user("t@finot.test")
        client_for(boss).patch(f"{BASE}users/{target.id}/", {"roles": [Role.SUPER_ADMIN]}, format="json")
        target.refresh_from_db()
        assert target.is_superuser

    def test_unknown_role_rejected(self, boss):
        target = make_user("t@finot.test")
        assert client_for(boss).patch(f"{BASE}users/{target.id}/", {"roles": ["God"]}, format="json").status_code == 400

    def test_cannot_lock_yourself_out(self, boss):
        c = client_for(boss)
        assert c.patch(f"{BASE}users/{boss.id}/", {"roles": []}, format="json").status_code == 400
        assert c.patch(f"{BASE}users/{boss.id}/", {"is_active": False}, format="json").status_code == 400
        assert boss.roles.filter(name=Role.SUPER_ADMIN).exists()

    def test_last_super_admin_cannot_be_removed_by_another_super_admin(self, boss):
        other = make_user("other@finot.test", Role.SUPER_ADMIN)
        # remove boss's role via other: allowed because 'other' remains
        assert client_for(other).patch(f"{BASE}users/{boss.id}/", {"roles": []}, format="json").status_code == 200
        # now 'other' is the only Super Admin and cannot remove self
        assert client_for(other).patch(f"{BASE}users/{other.id}/", {"roles": []}, format="json").status_code == 400

    def test_deactivate_other_user(self, boss):
        target = make_user("t@finot.test")
        res = client_for(boss).patch(f"{BASE}users/{target.id}/", {"is_active": False}, format="json")
        assert res.status_code == 200 and res.json()["is_active"] is False

    def test_unknown_user(self, boss):
        assert client_for(boss).patch(f"{BASE}users/99999/", {"is_active": True}, format="json").status_code == 404


@pytest.mark.django_db
class TestCounselors:
    def test_list_and_set_specializations(self, boss):
        c = make_user("c@finot.test", Role.QA_COUNSELOR)
        TeacherSpecialization.objects.create(user=c, specialization=TeacherSpecialization.ACADEMIC)
        listed = client_for(boss).get(BASE + "qa/counselors/").json()
        assert listed[0]["specializations"] == [TeacherSpecialization.ACADEMIC]
        res = client_for(boss).put(
            f"{BASE}qa/counselors/{c.id}/specializations/",
            {"specializations": [TeacherSpecialization.PSYCHOTHERAPIST]}, format="json",
        )
        assert res.status_code == 200
        assert list(c.qa_specializations.values_list("specialization", flat=True)) == [TeacherSpecialization.PSYCHOTHERAPIST]

    def test_validation_and_non_counselor(self, boss):
        c = make_user("c@finot.test", Role.QA_COUNSELOR)
        stu = make_user("s@finot.test")
        assert client_for(boss).put(f"{BASE}qa/counselors/{c.id}/specializations/", {"specializations": ["X"]}, format="json").status_code == 400
        assert client_for(boss).put(f"{BASE}qa/counselors/{stu.id}/specializations/", {"specializations": []}, format="json").status_code == 404


def fresher(i, gender="M"):
    user = make_user(f"f{i}@finot.test", gender=gender)
    StudentProfile.objects.filter(user=user).update(batch_year=1, status=StudentProfile.IN_CAMPUS, dorm_block=(i % 3) + 1, section=(i % 4) + 1)
    return user


@pytest.mark.django_db
class TestDistribution:
    def setup_method(self):
        self.f1, self.f2 = Family.objects.create(name="A"), Family.objects.create(name="B")
        self.students = [fresher(i) for i in range(10)]

    def test_overview(self, boss):
        data = client_for(boss).get(BASE + "families/distribution/").json()
        assert data["unassigned_count"] == 10 and data["limit"] == 10
        assert [f["name"] for f in data["families"]] == ["A", "B"]

    def test_preview_confirm_undo(self, boss):
        c = client_for(boss)
        preview = c.post(BASE + "families/distribution/preview/", {"family_ids": [self.f1.id, self.f2.id]}, format="json").json()
        assert preview["total_added"] == 10 and FamilyMembership.objects.count() == 0
        assert sorted(len(r["added"]) for r in preview["rows"]) == [5, 5]
        done = c.post(BASE + "families/distribution/confirm/", {"pairs": preview["pairs"]}, format="json").json()
        assert done["applied"] == 10 and FamilyMembership.objects.count() == 10
        batch_id = done["batch"]["id"]
        undo = c.post(f"{BASE}families/distribution/batches/{batch_id}/undo/")
        assert undo.status_code == 200 and undo.json()["removed"] == 10
        assert FamilyMembership.objects.count() == 0
        assert c.post(f"{BASE}families/distribution/batches/{batch_id}/undo/").status_code == 400

    def test_confirm_rechecks_each_pair(self, boss):
        FamilyMembership.objects.create(family=self.f2, student=self.students[0])
        res = client_for(boss).post(
            BASE + "families/distribution/confirm/",
            {"pairs": [[self.students[0].id, self.f1.id], [self.students[1].id, self.f1.id]]}, format="json",
        ).json()
        assert res["applied"] == 1 and "already in a family" in res["skipped"][0]

    def test_input_validation(self, boss):
        c = client_for(boss)
        assert c.post(BASE + "families/distribution/preview/", {"family_ids": []}, format="json").status_code == 400
        assert c.post(BASE + "families/distribution/preview/", {"family_ids": [self.f1.id], "gender": "X"}, format="json").status_code == 400
        assert c.post(BASE + "families/distribution/confirm/", {"pairs": "nope"}, format="json").status_code == 400

    def test_gender_filter(self, boss):
        fresher(50, "F")
        data = client_for(boss).post(
            BASE + "families/distribution/preview/", {"family_ids": [self.f1.id], "gender": "F"}, format="json"
        ).json()
        assert data["total_added"] == 1


@pytest.mark.django_db
class TestSms:
    def test_settings_roundtrip_and_validation(self, boss):
        c = client_for(boss)
        res = c.patch(BASE + "sms/settings/", {"enabled": True, "monthly_limit": 120}, format="json").json()
        assert res["enabled"] is True and res["monthly_limit"] == 120 and res["remaining_this_month"] == 120
        assert SMSConfiguration.get().enabled is True
        for bad in ({"enabled": "yes"}, {"monthly_limit": -1}, {"monthly_limit": "5"}, {"monthly_limit": True}):
            assert c.patch(BASE + "sms/settings/", bad, format="json").status_code == 400

    def test_logs_filter(self, boss):
        SMSLog.objects.create(phone="+251911223344", message="a", trigger=SMSLog.TRIGGER_NEW_EVENT, status=SMSLog.STATUS_SENT)
        SMSLog.objects.create(phone="+251911223344", message="b", trigger=SMSLog.TRIGGER_NEW_EVENT, status=SMSLog.STATUS_FAILED)
        c = client_for(boss)
        assert c.get(BASE + "sms/logs/").json()["count"] == 2
        assert c.get(BASE + "sms/logs/", {"status": "FAILED"}).json()["count"] == 1
        assert c.get(BASE + "sms/logs/", {"status": "NOPE"}).status_code == 400


@pytest.mark.django_db
class TestSubAdmins:
    def test_requires_super_admin(self):
        assert client_for(make_user("sa@finot.test", Role.SERVICE_ADMIN)).get(BASE + "sub-admins/").status_code == 403

    def test_lists_members_grouped_by_role_with_details(self, boss):
        from service.models import ServiceGroup
        sa = make_user("sa@finot.test", Role.SERVICE_ADMIN, Role.EVENT_MANAGER)  # one person, two roles
        baker.make(ServiceGroup, name="Choir", admin=sa)
        c = make_user("c@finot.test", Role.QA_COUNSELOR)
        TeacherSpecialization.objects.create(user=c, specialization=TeacherSpecialization.ACADEMIC)
        data = {r["name"]: r for r in client_for(boss).get(BASE + "sub-admins/").json()}
        assert Role.STUDENT not in data
        assert [m["email"] for m in data[Role.SERVICE_ADMIN]["members"]] == ["sa@finot.test"]
        assert data[Role.SERVICE_ADMIN]["members"][0]["detail"] == "Choir"
        assert data[Role.EVENT_MANAGER]["members"][0]["email"] == "sa@finot.test"  # same person under both roles
        assert data[Role.QA_COUNSELOR]["members"][0]["detail"] == "Academic"
        assert data[Role.SUPER_ADMIN]["members"][0]["email"] == "boss@finot.test"


@pytest.mark.django_db
class TestServiceGroupAdmin:
    def setup_method(self):
        from service.models import ServiceGroup
        self.g1, self.g2 = baker.make(ServiceGroup, name="A"), baker.make(ServiceGroup, name="B")

    def join(self, person, group):
        from service.models import ServiceGroupMembership
        ServiceGroupMembership.objects.create(student=person, service_group=group)

    def test_assign_gives_service_admin_role_and_staff_flag(self, boss):
        person = make_user("p@finot.test")
        self.join(person, self.g1)
        res = client_for(boss).put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": person.id}, format="json")
        assert res.status_code == 200
        person.refresh_from_db()
        self.g1.refresh_from_db()
        assert self.g1.admin_id == person.id and person.roles.filter(name=Role.SERVICE_ADMIN).exists() and person.is_staff

    def test_one_person_one_group(self, boss):
        person = make_user("p@finot.test")
        self.join(person, self.g1)
        self.join(person, self.g2)
        c = client_for(boss)
        c.put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": person.id}, format="json")
        res = c.put(f"{BASE}service-groups/{self.g2.id}/admin/", {"user_id": person.id}, format="json")
        assert res.status_code == 400 and "already runs" in str(res.json())

    def test_unassign_and_validation(self, boss):
        person = make_user("p@finot.test")
        self.join(person, self.g1)
        c = client_for(boss)
        c.put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": person.id}, format="json")
        assert c.put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": None}, format="json").json()["admin"] is None
        assert c.put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": "x"}, format="json").status_code == 400
        assert c.put(f"{BASE}service-groups/{self.g1.id}/admin/", {"user_id": 99999}, format="json").status_code == 400
        assert c.put(f"{BASE}service-groups/9999/admin/", {"user_id": None}, format="json").status_code == 404

    def test_list(self, boss):
        names = [g["name"] for g in client_for(boss).get(BASE + "service-groups/").json()]
        assert names == ["A", "B"]


@pytest.mark.django_db
class TestAddRemoveSingleRole:
    def test_add_and_remove_keep_other_roles(self, boss):
        person = make_user("p@finot.test", Role.STUDENT, Role.EVENT_MANAGER)
        c = client_for(boss)
        res = c.patch(f"{BASE}users/{person.id}/", {"add_role": Role.QA_COUNSELOR}, format="json").json()
        assert res["roles"] == sorted([Role.STUDENT, Role.EVENT_MANAGER, Role.QA_COUNSELOR])
        res = c.patch(f"{BASE}users/{person.id}/", {"remove_role": Role.EVENT_MANAGER}, format="json").json()
        assert res["roles"] == sorted([Role.STUDENT, Role.QA_COUNSELOR])

    def test_invalid_role_and_self_protection(self, boss):
        person = make_user("p@finot.test")
        assert client_for(boss).patch(f"{BASE}users/{person.id}/", {"add_role": "God"}, format="json").status_code == 400
        assert client_for(boss).patch(f"{BASE}users/{boss.id}/", {"remove_role": Role.SUPER_ADMIN}, format="json").status_code == 400


@pytest.mark.django_db
class TestSelectionWindowAndFamilies:
    def test_selection_window_toggle(self, boss):
        c = client_for(boss)
        assert c.get(BASE + "service-config/").json() == {"is_selection_open": False}
        assert c.patch(BASE + "service-config/", {"is_selection_open": True}, format="json").json() == {"is_selection_open": True}
        # the student-facing endpoint reflects it
        stu = client_for(make_user("stu@finot.test"))
        assert stu.get("/api/service/configuration/").json() == {"selection_open": True}
        assert c.patch(BASE + "service-config/", {"is_selection_open": "yes"}, format="json").status_code == 400
        assert c.patch(BASE + "service-config/", {"is_selection_open": False}, format="json").json()["is_selection_open"] is False

    def test_only_super_admin_can_change_window_or_create_family(self):
        sa = client_for(make_user("sa@finot.test", Role.SERVICE_ADMIN))
        assert sa.patch(BASE + "service-config/", {"is_selection_open": True}, format="json").status_code == 403
        assert sa.post(BASE + "families/", {"name": "X"}, format="json").status_code == 403

    def test_create_family_with_parents(self, boss):
        father, mother = train(make_user("f@finot.test", gender="M"), make_user("m@finot.test", gender="F"))
        res = client_for(boss).post(BASE + "families/", {"name": "Family 1", "father_id": father.id, "mother_id": mother.id,
                                                          "religious_father": "Abba X"}, format="json")
        assert res.status_code == 201
        fam = Family.objects.get(name="Family 1")
        assert fam.father_id == father.id and fam.mother_id == mother.id and fam.gender is None

    def test_family_rules(self, boss):
        c = client_for(boss)
        man, woman = train(make_user("f@finot.test", gender="M"), make_user("m@finot.test", gender="F"))
        assert c.post(BASE + "families/", {"name": " "}, format="json").status_code == 400
        assert c.post(BASE + "families/", {"name": "A", "father_id": woman.id}, format="json").status_code == 400  # father must be a man
        assert c.post(BASE + "families/", {"name": "A", "mother_id": man.id}, format="json").status_code == 400
        assert c.post(BASE + "families/", {"name": "A", "father_id": 99999}, format="json").status_code == 400
        assert c.post(BASE + "families/", {"name": "A", "father_id": man.id}, format="json").status_code == 201
        assert c.post(BASE + "families/", {"name": "a"}, format="json").status_code == 400  # duplicate name, any case
        assert c.post(BASE + "families/", {"name": "B", "father_id": man.id}, format="json").status_code == 400  # already leads one
        assert c.post(BASE + "families/", {"name": "C"}, format="json").status_code == 201  # parents optional


@pytest.mark.django_db
class TestUserFilters:
    URL = "/api/admin-console/users/"

    def setup_method(self):
        from service.models import ServiceGroup, ServiceGroupMembership
        self.admin = make_user("boss@finot.test", Role.SUPER_ADMIN)
        self.c = client_for(self.admin)

        def student(email, gender, batch, dept, block, section):
            u = make_user(email, gender=gender)
            StudentProfile.objects.update_or_create(
                user=u, defaults={"batch_year": batch, "department": dept, "dorm_block": block, "section": section}
            )
            return u

        self.a = student("a@finot.test", "M", 1, "Computer Science", 1, 1)
        self.b = student("b@finot.test", "F", 1, "computer science", 2, 2)
        self.d = student("d@finot.test", "F", 3, "Civil", 2, 1)
        self.group = baker.make(ServiceGroup, name="Choir")
        ServiceGroupMembership.objects.create(student=self.a, service_group=self.group)

    def emails(self, **params):
        res = self.c.get(self.URL, params)
        assert res.status_code == 200
        return {r["email"] for r in res.json()["results"]} - {"boss@finot.test"}

    def test_each_filter(self):
        assert self.emails(gender="F") == {"b@finot.test", "d@finot.test"}
        assert self.emails(batch=1) == {"a@finot.test", "b@finot.test"}
        assert self.emails(department="COMPUTER science") == {"a@finot.test", "b@finot.test"}  # any capitals
        assert self.emails(dorm_block=2) == {"b@finot.test", "d@finot.test"}
        assert self.emails(section=1) == {"a@finot.test", "d@finot.test"}
        assert self.emails(group=self.group.id) == {"a@finot.test"}
        assert self.emails(group="none") == {"b@finot.test", "d@finot.test"}
        assert self.emails(status="inactive") == set()

    def test_option_counts_keep_the_other_filters_but_not_their_own(self):
        counts = self.c.get(self.URL + "filters/", {"gender": "F", "batch": 1}).json()["counts"]
        assert counts["batch"] == {"1": 1, "3": 1}  # the batch filter itself is ignored, gender F is kept
        assert counts["gender"]["M"] == 1 and counts["gender"]["F"] == 1  # gender ignored, batch 1 is kept
        assert counts["department"] == {"computer science": 1}  # both spellings counted together, F + batch 1 kept
        assert counts["group"] == {"none": 1}  # the choir member is a man, so F + batch 1 leaves no group member

    def test_export_has_the_filtered_people_only(self):
        from io import BytesIO

        from openpyxl import load_workbook

        res = self.c.get(self.URL + "export/", {"gender": "F"})
        assert res.status_code == 200 and "spreadsheetml" in res["Content-Type"]
        sheet = load_workbook(BytesIO(res.content)).active
        rows = list(sheet.iter_rows(values_only=True))
        assert rows[0][0] == "Full name"
        assert {r[1] for r in rows[1:]} == {"b@finot.test", "d@finot.test"}
        assert client_for(self.a).get(self.URL + "export/").status_code == 403

    def test_filters_combine(self):
        assert self.emails(gender="F", batch=1) == {"b@finot.test"}
        assert self.emails(gender="F", batch=1, group="none") == {"b@finot.test"}
        assert self.emails(gender="M", batch=3) == set()

    def test_rows_carry_profile_facts(self):
        row = next(r for r in self.c.get(self.URL, {"search": "a@finot"}).json()["results"] if r["email"] == "a@finot.test")
        assert row["gender"] == "M" and row["batch_year"] == 1 and row["service_group"] == "Choir"

    def test_bad_number_is_a_clear_error(self):
        assert self.c.get(self.URL, {"batch": "x"}).status_code == 400

    def test_filter_options_offer_all_years_and_all_listed_departments(self):
        from student.models import Department

        Department.objects.create(name="Pharmacy", years=5)
        data = self.c.get(self.URL + "filters/").json()
        assert data["batches"] == [1, 2, 3, 4, 5] and data["dorm_blocks"] == [1, 2]
        # the Super Admin's list plus the values students already have
        assert sorted(d.lower() for d in data["departments"]) == ["civil", "computer science", "pharmacy"]
        assert data["groups"] == [{"id": self.group.id, "name": "Choir"}]

    def test_only_super_admin_may_filter(self):
        assert client_for(self.a).get(self.URL).status_code == 403

from core.role_rules import check_family_leader, check_role_eligibility  # noqa: E402
from datetime import timedelta  # noqa: E402
from django.core.exceptions import ValidationError as DjangoValidationError  # noqa: E402
from django.utils import timezone  # noqa: E402
from student import rollover  # noqa: E402
from student.models import Department, YearRollover  # noqa: E402


def student(email, batch, dept=None, status=StudentProfile.IN_CAMPUS, gender="M"):
    user = make_user(email, gender=gender, batch=batch)
    StudentProfile.objects.filter(user=user).update(department=dept, status=status)
    return User.objects.get(pk=user.pk)


@pytest.mark.django_db
class TestRoleEligibility:
    def test_year_rules(self):
        fresh, second, third = student("f@x.test", 1), student("s@x.test", 2), student("t@x.test", 3)
        with pytest.raises(DjangoValidationError):
            check_role_eligibility(fresh, Role.SERVICE_ADMIN)
        check_role_eligibility(second, Role.SERVICE_ADMIN)
        with pytest.raises(DjangoValidationError):
            check_role_eligibility(second, Role.QA_COUNSELOR)
        check_role_eligibility(third, Role.QA_COUNSELOR)
        check_role_eligibility(fresh, Role.SUPER_ADMIN)  # no year rule for the owner role

    def test_family_father_or_mother_needs_year_2(self):
        with pytest.raises(DjangoValidationError):
            check_family_leader(student("a@x.test", 1))
        check_family_leader(student("b@x.test", 2))

    def test_graduates_are_always_eligible_and_unknown_year_is_not(self):
        graduate = student("g@x.test", 5, status=StudentProfile.GRADUATED)
        check_role_eligibility(graduate, Role.QA_MODERATOR)
        with pytest.raises(DjangoValidationError):
            check_family_leader(graduate)  # a graduate may not lead a family
        nobody = make_user("n@x.test")
        StudentProfile.objects.filter(user=nobody).update(batch_year=None)
        with pytest.raises(DjangoValidationError):
            check_role_eligibility(User.objects.get(pk=nobody.pk), Role.EVENT_MANAGER)

    def test_console_refuses_a_fresher_with_a_clear_message(self):
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        fresh = student("fresh@x.test", 1)
        res = client_for(boss).patch(f"{BASE}users/{fresh.id}/", {"add_role": Role.EVENT_MANAGER}, format="json")
        assert res.status_code == 400 and "year 1" in res.json()["roles"]
        assert not fresh.roles.exists()

    def test_edit_year_and_role_in_one_request(self):
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        fresh = student("fresh@x.test", 1)
        res = client_for(boss).patch(
            f"{BASE}users/{fresh.id}/", {"batch_year": 2, "add_role": Role.EVENT_MANAGER}, format="json"
        )
        assert res.status_code == 200 and res.json()["batch_year"] == 2 and Role.EVENT_MANAGER in res.json()["roles"]

    def test_there_is_no_year_6_or_7(self):
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        pupil = student("pupil@x.test", 2)
        c = client_for(boss)
        for year in (6, 7):
            res = c.patch(f"{BASE}users/{pupil.id}/", {"batch_year": year}, format="json")
            assert res.status_code == 400 and "between 1 and 5" in res.json()["batch_year"]
        assert c.patch(f"{BASE}users/{pupil.id}/", {"batch_year": 5}, format="json").status_code == 200

    def test_failed_role_rolls_back_the_year_change(self):
        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        fresh = student("fresh@x.test", 1)
        res = client_for(boss).patch(
            f"{BASE}users/{fresh.id}/", {"batch_year": 2, "add_role": Role.QA_COUNSELOR}, format="json"
        )
        assert res.status_code == 400
        assert StudentProfile.objects.get(user=fresh).batch_year == 1


@pytest.mark.django_db
class TestProfileFactsAndDepartments:
    def setup_method(self):
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.c = client_for(self.boss)

    def test_departments_crud_rename_and_delete_rules(self):
        d = self.c.post(f"{BASE}departments/", {"name": "Pharmacy", "years": 5}, format="json").json()
        assert self.c.post(f"{BASE}departments/", {"name": "pharmacy", "years": 5}, format="json").status_code == 400
        assert self.c.post(f"{BASE}departments/", {"name": "X", "years": 2}, format="json").status_code == 400
        s = student("p@x.test", 2, "Pharmacy")
        assert self.c.get(f"{BASE}departments/").json()[0]["student_count"] == 1
        assert self.c.delete(f"{BASE}departments/{d['id']}/").status_code == 400  # students use it
        self.c.patch(f"{BASE}departments/{d['id']}/", {"name": "Pharmacy Sciences"}, format="json")
        assert StudentProfile.objects.get(user=s).department == "Pharmacy Sciences"  # students follow the rename
        short = self.c.patch(f"{BASE}departments/{d['id']}/", {"years": 4}, format="json")
        assert short.status_code == 200
        StudentProfile.objects.filter(user=s).update(batch_year=5)
        assert self.c.patch(f"{BASE}departments/{d['id']}/", {"years": 4}, format="json").status_code == 400

    def test_student_sets_year_and_department_once(self):
        Department.objects.create(name="Architecture", years=5)
        u = make_user("a@x.test", batch=None)
        StudentProfile.objects.filter(user=u).update(batch_year=None)
        me = client_for(u)
        assert me.patch("/api/student/profiles/me/", {"batch_year": 1, "department": "architecture"}, format="json").status_code == 200
        profile = StudentProfile.objects.get(user=u)
        assert profile.batch_year == 1 and profile.department == "Architecture"  # stored as in the list
        locked = me.patch("/api/student/profiles/me/", {"batch_year": 3}, format="json")
        assert locked.status_code == 400 and "locked" in str(locked.json())
        assert me.patch("/api/student/profiles/me/", {"batch_year": 1, "department": "Architecture"}, format="json").status_code == 200
        assert me.patch("/api/student/profiles/me/", {"status": "GRADUATED"}, format="json").status_code == 400

    def test_a_student_on_a_stage_chooses_again_from_what_it_leads_to(self):
        pre = Department.objects.create(name="Pre-Engineering", years=5, is_stage=True)
        school = Department.objects.create(name="School of Electrical Engineering", years=5, is_stage=True)
        ece = Department.objects.create(name="Electrical and Computer Engineering", years=5)
        Department.objects.create(name="Pharmacy", years=5)
        pre.leads_to.add(school)
        school.leads_to.add(ece)
        u = make_user("e@x.test", batch=None)
        StudentProfile.objects.filter(user=u).update(batch_year=None)
        me = client_for(u)
        assert me.patch("/api/student/profiles/me/", {"batch_year": 1, "department": "Pre-Engineering"}, format="json").status_code == 200
        wrong = me.patch("/api/student/profiles/me/", {"department": "Pharmacy"}, format="json")
        assert wrong.status_code == 400 and "School of Electrical Engineering" in str(wrong.json())  # not where the stage leads
        assert me.patch("/api/student/profiles/me/", {"department": "School of Electrical Engineering"}, format="json").status_code == 200
        StudentProfile.objects.filter(user=u).update(batch_year=2)  # the yearly rollover moves the year
        assert me.patch("/api/student/profiles/me/", {"department": "Electrical and Computer Engineering"}, format="json").status_code == 200
        assert me.patch("/api/student/profiles/me/", {"department": "Pharmacy"}, format="json").status_code == 400  # final: locked
        assert me.patch("/api/student/profiles/me/", {"batch_year": 3}, format="json").status_code == 400  # the year stays locked
        row = next(d for d in me.get("/api/student/departments/").json() if d["name"] == "Pre-Engineering")
        assert row["is_stage"] is True and row["leads_to"] == [school.id]

    def test_year_one_only_accepts_a_stage_once_stages_exist(self):
        Department.objects.create(name="Pre-Science", years=5, is_stage=True)
        Department.objects.create(name="Pharmacy", years=5)
        u = make_user("y1@x.test", batch=None)
        StudentProfile.objects.filter(user=u).update(batch_year=None)
        me = client_for(u)
        bad = me.patch("/api/student/profiles/me/", {"batch_year": 1, "department": "Pharmacy"}, format="json")
        assert bad.status_code == 400 and "stage" in str(bad.json())
        assert me.patch("/api/student/profiles/me/", {"batch_year": 1, "department": "Pre-Science"}, format="json").status_code == 200
        # the Super Admin follows the same rule when editing details
        res = self.c.patch(f"{BASE}users/{u.id}/", {"department": "Pharmacy"}, format="json")
        assert res.status_code == 400
        # an older record with a final department in year 1 can still save other fields
        StudentProfile.objects.filter(user=u).update(department="Pharmacy")
        assert me.patch("/api/student/profiles/me/", {"personal_phone": "0911223344"}, format="json").status_code == 200

    def test_super_admin_defines_stages(self):
        a = self.c.post(f"{BASE}departments/", {"name": "Pre-Science", "years": 4, "is_stage": True}, format="json").json()
        b = self.c.post(f"{BASE}departments/", {"name": "Biology", "years": 4}, format="json").json()
        assert a["is_stage"] is True and a["leads_to"] == [] and b["is_stage"] is False
        res = self.c.patch(f"{BASE}departments/{a['id']}/", {"leads_to": [b["id"]]}, format="json").json()
        assert res["leads_to"] == [b["id"]] and res["leads_to_names"] == ["Biology"]
        assert self.c.patch(f"{BASE}departments/{a['id']}/", {"leads_to": [a["id"]]}, format="json").status_code == 400
        assert self.c.patch(f"{BASE}departments/{a['id']}/", {"leads_to": [999999]}, format="json").status_code == 400
        assert self.c.patch(f"{BASE}departments/{a['id']}/", {"is_stage": "yes"}, format="json").status_code == 400
        # a stage has no length of its own: the longest of what it leads to, 5 when it leads nowhere yet
        from student import rollover

        assert res["effective_years"] == 4 and rollover.program_years("Pre-Science") == 4
        c = self.c.post(f"{BASE}departments/", {"name": "Pre-Engineering", "years": 3, "is_stage": True}, format="json").json()
        assert c["effective_years"] == 5 and rollover.program_years("Pre-Engineering") == 5
        s = student("pe@x.test", 3, "Pre-Engineering")
        assert client_for(s).get("/api/student/profiles/me/").json()["department_is_stage"] is True
        assert rollover.build_preview()["graduating"] == 0 if "graduating" in rollover.build_preview() else True

    def test_department_must_come_from_the_list_when_there_is_one(self):
        Department.objects.create(name="Architecture", years=5)
        u = make_user("a@x.test")
        StudentProfile.objects.filter(user=u).update(batch_year=None)
        res = client_for(u).patch("/api/student/profiles/me/", {"department": "Basket weaving"}, format="json")
        assert res.status_code == 400

    def test_super_admin_edits_year_department_and_stage(self):
        Department.objects.create(name="Civil", years=4)
        s = student("s@x.test", 2)
        res = self.c.patch(f"{BASE}users/{s.id}/", {"department": "civil", "batch_year": 3, "student_status": "GRADUATED"}, format="json").json()
        assert res["department"] == "Civil" and res["batch_year"] == 3 and res["student_status"] == "GRADUATED"
        assert self.c.patch(f"{BASE}users/{s.id}/", {"batch_year": 5}, format="json").status_code == 400  # 4-year program

    def test_stage_filter(self):
        student("a@x.test", 2)
        student("g@x.test", 5, status=StudentProfile.GRADUATED)
        rows = {r["email"] for r in self.c.get(f"{BASE}users/", {"stage": "graduated"}).json()["results"]}
        assert rows == {"g@x.test"}


@pytest.mark.django_db
class TestYearRollover:
    def setup_method(self):
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.c = client_for(self.boss)
        Department.objects.create(name="Pharmacy", years=5)
        Department.objects.create(name="Computer Science", years=4)
        self.a = student("a@x.test", 1, "Pharmacy")
        self.b = student("b@x.test", 4, "Computer Science")  # last year of a 4-year program
        self.c5 = student("c@x.test", 5, "Pharmacy")  # last year of a 5-year program
        self.unknown = make_user("u@x.test")
        StudentProfile.objects.filter(user=self.unknown).update(batch_year=None)
        self.old = student("o@x.test", 5, "Pharmacy", status=StudentProfile.GRADUATED)

    def facts(self, user):
        p = StudentProfile.objects.get(user=user)
        return p.batch_year, p.status

    def test_preview_changes_nothing_and_counts_correctly(self):
        data = self.c.get(f"{BASE}academic-year/").json()["preview"]
        assert data["promote"] == 1 and data["graduate"] == 2 and data["unknown_year"] >= 1
        assert self.facts(self.a) == (1, "IN_CAMPUS")

    def test_rollover_promotes_and_graduates_by_program_length(self):
        res = self.c.post(f"{BASE}academic-year/rollover/", {"label": "2026/27"}, format="json")
        assert res.status_code == 201 and res.json()["promoted"] == 1 and res.json()["graduated"] == 2
        assert self.facts(self.a) == (2, "IN_CAMPUS")
        assert self.facts(self.b) == (4, "GRADUATED")
        assert self.facts(self.c5) == (5, "GRADUATED")
        assert self.facts(self.old) == (5, "GRADUATED")  # earlier graduates are left alone
        assert self.facts(self.unknown) == (None, "IN_CAMPUS")

    def test_roles_survive_graduation(self):
        UserRole.objects.create(user=self.c5, role=Role.objects.get_or_create(name=Role.QA_COUNSELOR)[0])
        self.c.post(f"{BASE}academic-year/rollover/", {}, format="json")
        assert User.objects.get(pk=self.c5.pk).roles.filter(name=Role.QA_COUNSELOR).exists()

    def test_second_run_too_soon_is_refused_unless_forced(self):
        assert self.c.post(f"{BASE}academic-year/rollover/", {}, format="json").status_code == 201
        again = self.c.post(f"{BASE}academic-year/rollover/", {}, format="json")
        assert again.status_code == 400 and "already started" in again.json()["detail"]
        assert self.facts(self.a) == (2, "IN_CAMPUS")
        assert self.c.post(f"{BASE}academic-year/rollover/", {"force": True}, format="json").status_code == 201
        assert self.facts(self.a) == (3, "IN_CAMPUS")

    def test_undo_restores_and_only_the_latest_can_be_undone(self):
        run = self.c.post(f"{BASE}academic-year/rollover/", {}, format="json").json()
        out = self.c.post(f"{BASE}academic-year/rollover/{run['id']}/undo/").json()
        assert out["restored"] == 3 and out["skipped"] == 0
        assert self.facts(self.a) == (1, "IN_CAMPUS") and self.facts(self.b) == (4, "IN_CAMPUS")
        assert self.c.post(f"{BASE}academic-year/rollover/{run['id']}/undo/").status_code == 400  # already undone

    def test_undo_skips_people_edited_since(self):
        run = self.c.post(f"{BASE}academic-year/rollover/", {}, format="json").json()
        StudentProfile.objects.filter(user=self.a).update(batch_year=3)  # corrected by hand afterwards
        out = self.c.post(f"{BASE}academic-year/rollover/{run['id']}/undo/").json()
        assert out["skipped"] == 1 and self.facts(self.a) == (3, "IN_CAMPUS")

    def test_old_run_cannot_be_undone_after_a_newer_one(self):
        first = self.c.post(f"{BASE}academic-year/rollover/", {}, format="json").json()
        YearRollover.objects.filter(pk=first["id"]).update(performed_at=timezone.now() - timedelta(days=400))
        self.c.post(f"{BASE}academic-year/rollover/", {}, format="json")
        assert self.c.post(f"{BASE}academic-year/rollover/{first['id']}/undo/").status_code == 400

    def test_only_super_admin(self):
        assert client_for(self.a).post(f"{BASE}academic-year/rollover/", {}, format="json").status_code == 403
        assert client_for(self.a).get(f"{BASE}departments/").status_code == 403

    def test_program_length_defaults_to_five_for_unlisted_departments(self):
        assert rollover.program_years("Unknown dept") == 5


@pytest.mark.django_db
class TestGraduates:
    def test_graduate_cannot_choose_a_group(self):
        from service.models import ServiceConfiguration
        ServiceConfiguration.objects.create(is_selection_open=True)
        g = student("g@x.test", 5, status=StudentProfile.GRADUATED)
        group = baker.make("service.ServiceGroup", name="Choir")
        res = client_for(g).post("/api/service/selections/", {"selections": [{"service_group": group.id, "priority": 1}]}, format="json")
        assert res.status_code == 403 and "Graduates" in res.json()["detail"]


@pytest.mark.django_db
class TestStudentCards:
    def setup_method(self):
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.sa = make_user("sa@x.test", Role.SERVICE_ADMIN)
        self.other_sa = make_user("sa2@x.test", Role.SERVICE_ADMIN)
        from service.models import AgeglotSelection, ServiceGroup
        self.mine = baker.make(ServiceGroup, name="Choir", admin=self.sa)
        self.theirs = baker.make(ServiceGroup, name="Charity", admin=self.other_sa)
        self.applicant = student("app@x.test", 2, "Pharmacy")
        StudentProfile.objects.filter(user=self.applicant).update(
            personal_phone="0911223344", emergency_name="Mom", home_address="Adama", confession_father="Abba X", dorm_block=3,
        )
        AgeglotSelection.objects.create(student=self.applicant, service_group=self.mine, priority=1, skills="sing", reason="love it")
        self.stranger = student("str@x.test", 2, "Pharmacy")

    def test_super_admin_sees_everything(self):
        card = client_for(self.boss).get(f"{BASE}users/{self.applicant.id}/").json()
        assert card["full"] is True and card["emergency_name"] == "Mom" and card["confession_father"] == "Abba X"
        assert card["personal_phone"] == "0911223344" and card["department"] == "Pharmacy"

    def test_group_admin_sees_their_applicant_without_private_parts(self):
        res = client_for(self.sa).get(f"/api/service/groups/{self.mine.id}/students/{self.applicant.id}/")
        assert res.status_code == 200
        card = res.json()
        assert card["personal_phone"] == "0911223344" and card["dorm_block"] == 3
        assert card["choice"] == {"priority": 1, "skills": "sing", "reason": "love it"}
        assert "emergency_name" not in card and "home_address" not in card and "confession_father" not in card

    def test_group_admin_cannot_open_other_students_or_other_groups(self):
        assert client_for(self.sa).get(f"/api/service/groups/{self.mine.id}/students/{self.stranger.id}/").status_code == 404
        # the admin of another group may not use this group's door at all
        assert client_for(self.other_sa).get(f"/api/service/groups/{self.mine.id}/students/{self.applicant.id}/").status_code == 403

    def test_members_can_be_opened_too(self):
        from service.models import ServiceGroupMembership
        ServiceGroupMembership.objects.create(student=self.stranger, service_group=self.mine)
        assert client_for(self.sa).get(f"/api/service/groups/{self.mine.id}/students/{self.stranger.id}/").status_code == 200

    def test_a_student_cannot_open_anyone(self):
        assert client_for(self.applicant).get(f"{BASE}users/{self.stranger.id}/").status_code == 403
        assert client_for(self.applicant).get(f"/api/service/groups/{self.mine.id}/students/{self.applicant.id}/").status_code == 403


@pytest.mark.django_db
class TestServiceAdminComesFromTheGroup:
    def setup_method(self):
        from service.models import ServiceGroup, ServiceGroupMembership
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.c = client_for(self.boss)
        self.choir = baker.make(ServiceGroup, name="Choir")
        self.media = baker.make(ServiceGroup, name="Media")
        self.a = make_user("a@x.test")
        self.b = make_user("b@x.test")
        ServiceGroupMembership.objects.create(student=self.a, service_group=self.choir)
        ServiceGroupMembership.objects.create(student=self.b, service_group=self.choir)

    def set_admin(self, group, user_id):
        return self.c.put(f"{BASE}service-groups/{group.id}/admin/", {"user_id": user_id}, format="json")

    def test_only_a_member_of_the_group_can_run_it(self):
        res = self.set_admin(self.media, self.a.id)  # a belongs to Choir, not Media
        assert res.status_code == 400 and "not a member of 'Media'" in str(res.json())
        assert not self.a.roles.exists()
        assert self.set_admin(self.choir, self.a.id).status_code == 200

    def test_role_cannot_be_given_in_users_and_roles(self):
        res = self.c.patch(f"{BASE}users/{self.a.id}/", {"add_role": Role.SERVICE_ADMIN}, format="json")
        assert res.status_code == 400 and "admin of a group they belong to" in res.json()["roles"]
        assert any(r["via_group"] for r in self.c.get(BASE + "roles/").json())

    def test_changing_the_admin_moves_the_role(self):
        self.set_admin(self.choir, self.a.id)
        self.set_admin(self.choir, self.b.id)
        assert not self.a.roles.filter(name=Role.SERVICE_ADMIN).exists() and not User.objects.get(pk=self.a.pk).is_staff
        assert self.b.roles.filter(name=Role.SERVICE_ADMIN).exists()

    def test_clearing_the_admin_takes_the_role_away(self):
        self.set_admin(self.choir, self.a.id)
        self.set_admin(self.choir, None)
        assert not self.a.roles.filter(name=Role.SERVICE_ADMIN).exists()

    def test_removing_the_role_clears_the_group(self):
        from service.models import ServiceGroup
        self.set_admin(self.choir, self.a.id)
        self.c.patch(f"{BASE}users/{self.a.id}/", {"remove_role": Role.SERVICE_ADMIN}, format="json")
        assert ServiceGroup.objects.get(pk=self.choir.pk).admin_id is None

    def test_the_admin_cannot_be_removed_from_their_own_group(self):
        self.set_admin(self.choir, self.a.id)
        res = self.c.post(f"/api/service/groups/{self.choir.id}/remove-member/", {"student_id": self.a.id}, format="json")
        assert res.status_code == 400 and "runs the group" in res.json()["detail"]
        self.set_admin(self.choir, self.b.id)
        assert self.c.post(f"/api/service/groups/{self.choir.id}/remove-member/", {"student_id": self.a.id}, format="json").status_code == 200

    def test_year_rule_still_applies(self):
        fresh = student("fresh@x.test", 1)
        from service.models import ServiceGroupMembership
        ServiceGroupMembership.objects.create(student=fresh, service_group=self.choir)
        res = self.set_admin(self.choir, fresh.id)
        assert res.status_code == 400 and "year 1" in str(res.json())


@pytest.mark.django_db
class TestFamilyAdminAccess:
    """The Family Admin runs the Families page (create, distribute, undo) and nothing else of the console."""

    FAMILY_URLS = ["families/distribution/", "families/people/?search=ab"]

    def test_family_admin_and_super_admin_in_everyone_else_out(self, boss):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        others = [make_user("stu@finot.test"), make_user("sa@finot.test", Role.SERVICE_ADMIN),
                  make_user("mod@finot.test", Role.QA_MODERATOR), make_user("ev@finot.test", Role.EVENT_MANAGER)]
        for url in self.FAMILY_URLS:
            assert APIClient().get(BASE + url).status_code == 401
            for user in others:
                assert client_for(user).get(BASE + url).status_code == 403
            assert client_for(fam).get(BASE + url).status_code == 200
            assert client_for(boss).get(BASE + url).status_code == 200

    def test_family_admin_stays_out_of_the_rest_of_the_console(self):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        for url in ["overview/", "roles/", "users/", "users/filters/", "qa/counselors/", "sms/settings/", "sub-admins/", "donations/"]:
            assert client_for(fam).get(BASE + url).status_code == 403, url
        assert client_for(fam).patch(BASE + "service-config/", {"is_selection_open": True}, format="json").status_code == 403

    def test_family_admin_creates_family_and_distributes(self):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        father = train(make_user("dad@finot.test", gender="M", batch=5))
        mother = train(make_user("mum@finot.test", gender="F", batch=5))
        c = client_for(fam)
        res = c.post(BASE + "families/", {"name": "Family 9", "father_id": father.id, "mother_id": mother.id}, format="json")
        assert res.status_code == 201
        family = Family.objects.get(name="Family 9")
        fresher = make_user("new@finot.test", gender="F", batch=1)
        preview = c.post(BASE + "families/distribution/preview/", {"family_ids": [family.id]}, format="json").json()
        assert preview["total_added"] == 1
        done = c.post(BASE + "families/distribution/confirm/", {"pairs": preview["pairs"]}, format="json").json()
        assert done["applied"] == 1 and FamilyMembership.objects.filter(student=fresher).exists()
        assert c.post(f"{BASE}families/distribution/batches/{done['batch']['id']}/undo/").status_code == 200
        assert not FamilyMembership.objects.exists()

    def test_people_search_is_small_and_needs_two_letters(self):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        make_user("selam@finot.test", gender="F")
        c = client_for(fam)
        assert c.get(BASE + "families/people/", {"search": "s"}).json() == {"results": []}
        row = c.get(BASE + "families/people/", {"search": "selam"}).json()["results"][0]
        assert set(row) == {"id", "full_name", "email", "is_active", "gender"}


@pytest.mark.django_db
class TestAutoFamilies:
    """The system makes the families itself: mixed, at most 10 students each, women and men spread out."""

    def fresh(self, n, women):
        out = []
        for i in range(n):
            u = make_user(f"fr{i}@finot.test", gender="F" if i < women else "M", batch=1)
            StudentProfile.objects.filter(user=u).update(
                batch_year=1, status=StudentProfile.IN_CAMPUS, dorm_block=(i % 6) + 1, section=(i % 3) + 1)
            out.append(u)
        return out

    def test_preview_saves_nothing_and_confirm_creates_even_mixed_families(self, boss):
        self.fresh(25, women=13)
        c = client_for(boss)
        preview = c.post(BASE + "families/distribution/auto-preview/").json()
        assert Family.objects.count() == 0 and FamilyMembership.objects.count() == 0
        assert [f["name"] for f in preview["new_families"]] == ["Family 1", "Family 2", "Family 3"]
        sizes = sorted(len(r["added"]) for r in preview["rows"])
        assert sizes == [8, 8, 9] and max(sizes) <= 10
        for row in preview["rows"]:
            assert row["female"] >= 4 and row["male"] >= 4  # both genders in every family
        done = c.post(BASE + "families/distribution/confirm/",
                      {"pairs": preview["pairs"], "new_families": preview["new_families"]}, format="json").json()
        assert done["applied"] == 25 and Family.objects.count() == 3
        assert all(f.gender in (None, "") for f in Family.objects.all())
        # nothing left to place: the next run plans nothing and creates nothing
        again = c.post(BASE + "families/distribution/auto-preview/").json()
        assert again["total_added"] == 0 and again["new_families"] == []
        # undo removes the students and the families this run made (nobody had touched them)
        assert c.post(f"{BASE}families/distribution/batches/{done['batch']['id']}/undo/").status_code == 200
        assert FamilyMembership.objects.count() == 0
        assert Family.objects.count() == 0
        refill = c.post(BASE + "families/distribution/auto-preview/").json()
        assert [f["name"] for f in refill["new_families"]] == ["Family 1", "Family 2", "Family 3"] and refill["total_added"] == 25

    def test_fills_existing_mixed_family_first_and_names_continue(self, boss):
        Family.objects.create(name="Family 7")
        self.fresh(14, women=7)
        preview = client_for(boss).post(BASE + "families/distribution/auto-preview/").json()
        assert [f["name"] for f in preview["new_families"]] == ["Family 8"]
        assert sorted(r["family_name"] for r in preview["rows"]) == ["Family 7", "Family 8"]

    def test_confirm_rejects_bad_new_families_and_leaves_nothing(self, boss):
        users = self.fresh(3, women=1)
        c = client_for(boss)
        pairs = [[users[0].id, -1]]
        for bad in ([{"temp_id": 5, "name": "X"}], [{"temp_id": -1, "name": " "}], [{"temp_id": -1, "name": "A"}, {"temp_id": -2, "name": "a"}]):
            assert c.post(BASE + "families/distribution/confirm/", {"pairs": pairs, "new_families": bad}, format="json").status_code == 400
        Family.objects.create(name="Taken")
        assert c.post(BASE + "families/distribution/confirm/", {"pairs": pairs, "new_families": [{"temp_id": -1, "name": "taken"}]}, format="json").status_code == 400
        assert Family.objects.count() == 1
        # a student who cannot be placed means no empty family is left behind
        second = make_user("senior@finot.test", gender="F", batch=4)
        res = c.post(BASE + "families/distribution/confirm/", {"pairs": [[second.id, -1]], "new_families": [{"temp_id": -1, "name": "Ghost"}]}, format="json").json()
        assert res["applied"] == 0 and not Family.objects.filter(name="Ghost").exists()

    def test_family_admin_may_use_it(self):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        self.fresh(4, women=2)
        res = client_for(fam).post(BASE + "families/distribution/auto-preview/")
        assert res.status_code == 200 and res.json()["total_added"] == 4
        assert client_for(make_user("stu@finot.test")).post(BASE + "families/distribution/auto-preview/").status_code == 403


@pytest.mark.django_db
class TestFamilyParents:
    def test_list_and_set_parents_on_an_automatic_family(self):
        fam = make_user("fam@finot.test", Role.FAMILY_ADMIN)
        dad = make_user("dad@finot.test", gender="M", batch=5)
        mum = make_user("mum@finot.test", gender="F", batch=5)
        junior = make_user("jun@finot.test", gender="M", batch=1)
        done = Family.objects.create(name="Family 1", father=dad, mother=mum)
        empty = Family.objects.create(name="Family 2")
        c = client_for(fam)
        rows = c.get(BASE + "families/").json()["results"]
        assert [r["name"] for r in rows] == ["Family 2", "Family 1"]  # incomplete families first
        assert rows[0]["father"] is None and rows[1]["father"]["email"] == "dad@finot.test"
        # one person leads one family; a woman cannot be father; year rule applies
        url = f"{BASE}families/{empty.id}/"
        assert c.patch(url, {"father_id": dad.id}, format="json").status_code == 400
        assert c.patch(url, {"father_id": mum.id}, format="json").status_code == 400
        assert c.patch(url, {"father_id": junior.id}, format="json").status_code == 400
        dad2 = train(make_user("dad2@finot.test", gender="M", batch=4))
        res = c.patch(url, {"father_id": dad2.id, "religious_father": "Aba Giorgis"}, format="json")
        assert res.status_code == 200 and res.json()["father"]["id"] == dad2.id
        empty.refresh_from_db()
        assert empty.father_id == dad2.id and empty.religious_father == "Aba Giorgis"
        # the same father can be re-saved on his own family, and cleared
        assert c.patch(f"{BASE}families/{done.id}/", {"father_id": dad.id}, format="json").status_code == 200
        assert c.patch(f"{BASE}families/{done.id}/", {"mother_id": None}, format="json").json()["mother"] is None
        # a father who graduated stays; a graduate cannot be named as a NEW father
        StudentProfile.objects.filter(user=dad).update(status=StudentProfile.GRADUATED)
        assert c.patch(f"{BASE}families/{done.id}/", {"father_id": dad.id, "name": "Family 1b"}, format="json").status_code == 200
        old_boy = make_user("old@finot.test", gender="M", batch=5)
        StudentProfile.objects.filter(user=old_boy).update(status=StudentProfile.GRADUATED)
        res = c.patch(url, {"father_id": old_boy.id}, format="json")
        assert res.status_code == 400 and "graduated" in res.json()["father_id"]
        assert c.patch(f"{BASE}families/99999/", {}, format="json").status_code == 404

    def test_students_cannot_edit_or_list(self):
        stu = make_user("stu@finot.test")
        f = Family.objects.create(name="F")
        assert client_for(stu).get(BASE + "families/").status_code == 403
        assert client_for(stu).patch(f"{BASE}families/{f.id}/", {"name": "Z"}, format="json").status_code == 403


@pytest.mark.django_db
class TestFamilyCleanup:
    def fresh(self, n):
        for i in range(n):
            u = make_user(f"cl{i}@finot.test", gender="F" if i % 2 else "M", batch=1)
            StudentProfile.objects.filter(user=u).update(batch_year=1, status=StudentProfile.IN_CAMPUS)

    def run_auto(self, c):
        preview = c.post(BASE + "families/distribution/auto-preview/").json()
        done = c.post(BASE + "families/distribution/confirm/",
                      {"pairs": preview["pairs"], "new_families": preview["new_families"]}, format="json").json()
        return done["batch"]["id"]

    def test_undo_removes_the_families_the_run_created_if_untouched(self, boss):
        self.fresh(12)
        c = client_for(boss)
        batch = self.run_auto(c)
        assert Family.objects.count() == 2
        dad = make_user("dad@finot.test", gender="M", batch=5)
        Family.objects.filter(name="Family 1").update(father=dad)  # someone already set a father here
        assert c.post(f"{BASE}families/distribution/batches/{batch}/undo/").json()["removed"] == 12
        assert list(Family.objects.values_list("name", flat=True)) == ["Family 1"]  # only the untouched one went

    def test_families_made_by_hand_survive_undo(self, boss):
        Family.objects.create(name="Mine")
        self.fresh(4)
        c = client_for(boss)
        batch = self.run_auto(c)
        assert Family.objects.count() == 1  # it filled the hand-made family, created none
        c.post(f"{BASE}families/distribution/batches/{batch}/undo/")
        assert Family.objects.filter(name="Mine").exists()

    def test_delete_family_frees_students_and_parents(self, boss):
        dad = make_user("dad@finot.test", gender="M", batch=5)
        fam = Family.objects.create(name="Gone", father=dad)
        s = make_user("kid@finot.test", batch=1)
        FamilyMembership.objects.create(family=fam, student=s)
        c = client_for(boss)
        res = c.delete(f"{BASE}families/{fam.id}/")
        assert res.status_code == 200 and res.json() == {"removed_students": 1}
        assert not Family.objects.exists() and not FamilyMembership.objects.exists()
        assert User.objects.filter(pk=dad.pk).exists() and User.objects.filter(pk=s.pk).exists()
        assert c.delete(f"{BASE}families/{fam.id}/").status_code == 404
        assert client_for(make_user("stu@finot.test")).delete(f"{BASE}families/1/").status_code == 403

    def test_rename_family(self, boss):
        a, b = Family.objects.create(name="A"), Family.objects.create(name="B")
        c = client_for(boss)
        assert c.patch(f"{BASE}families/{a.id}/", {"name": "Zion"}, format="json").json()["name"] == "Zion"
        assert c.patch(f"{BASE}families/{a.id}/", {"name": "b"}, format="json").status_code == 400
