import pytest

from analytics.test_console import BASE, client_for, make_user
from core.models import Role
from service.models import Family, FamilyMembership
from student.models import StudentProfile

CANDIDATES = BASE + "families/parents/candidates/"


def senior(email, gender, year=3, **profile):
    u = make_user(email, gender=gender, batch=year)
    if profile:
        StudentProfile.objects.filter(user=u).update(**profile)
    return u


@pytest.mark.django_db
class TestParentCandidates:
    def admin(self):
        return client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN, gender="F", batch=4))

    def test_only_free_eligible_people_are_listed_by_gender(self):
        dad = senior("dad@finot.test", "M")
        mum = senior("mum@finot.test", "F", year=5)
        senior("boy1@finot.test", "M", year=1)  # first year: too young
        senior("grad@finot.test", "M", year=5, status=StudentProfile.GRADUATED)  # a graduate may not be named
        taken = senior("taken@finot.test", "M")
        Family.objects.create(name="Family 1", father=taken)  # already leads a family
        child = senior("child@finot.test", "F", year=2)
        FamilyMembership.objects.create(family=Family.objects.get(name="Family 1"), student=child)  # a child, not a parent
        gone = senior("gone@finot.test", "M")
        type(gone).objects.filter(pk=gone.pk).update(is_active=False)
        data = self.admin().get(CANDIDATES).json()
        assert [p["id"] for p in data["fathers"]] == [dad.id]
        assert mum.id in [p["id"] for p in data["mothers"]] and child.id not in [p["id"] for p in data["mothers"]]
        assert data["fathers"][0]["year"] == 3 and data["families_without_father"] == 0 and data["families_without_mother"] == 1

    def test_search_narrows_the_list(self):
        senior("abel@finot.test", "M")
        senior("kebede@finot.test", "M")
        data = self.admin().get(CANDIDATES, {"search": "keb"}).json()
        assert [p["email"] for p in data["fathers"]] == ["kebede@finot.test"]

    def test_a_student_cannot_see_it(self):
        assert client_for(make_user("stu@finot.test", batch=2)).get(CANDIDATES).status_code == 403


ASSIGN = BASE + "families/parents/assign/"


@pytest.mark.django_db
class TestAssignManyParents:
    def admin(self):
        return client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN, gender="F", batch=4))

    def test_many_families_get_their_father_and_mother_in_one_request(self):
        f1, f2 = Family.objects.create(name="Family 1"), Family.objects.create(name="Family 2")
        d1, d2 = senior("d1@finot.test", "M"), senior("d2@finot.test", "M", year=4)
        m1, m2 = senior("m1@finot.test", "F"), senior("m2@finot.test", "F", year=5)
        res = self.admin().post(ASSIGN, {"assignments": [
            {"family_id": f1.id, "father_id": d1.id, "mother_id": m1.id},
            {"family_id": f2.id, "father_id": d2.id, "mother_id": m2.id},
        ]}, format="json").json()
        assert res["applied"] == 2 and res["failed"] == 0
        f1.refresh_from_db()
        f2.refresh_from_db()
        assert (f1.father_id, f1.mother_id, f2.father_id, f2.mother_id) == (d1.id, m1.id, d2.id, m2.id)

    def test_a_refused_row_does_not_stop_the_others(self):
        f1, f2, f3 = (Family.objects.create(name=f"Family {i}") for i in (1, 2, 3))
        good, woman = senior("good@finot.test", "M"), senior("woman@finot.test", "F")
        grad = senior("grad@finot.test", "M", year=5, status=StudentProfile.GRADUATED)
        res = self.admin().post(ASSIGN, {"assignments": [
            {"family_id": f1.id, "father_id": woman.id},  # a woman cannot be father
            {"family_id": f2.id, "father_id": good.id},
            {"family_id": f3.id, "father_id": grad.id},  # a graduate cannot be named
        ]}, format="json").json()
        assert res["applied"] == 1 and res["failed"] == 2
        by_name = {r["family_name"]: r for r in res["results"]}
        assert not by_name["Family 1"]["ok"] and "man" in by_name["Family 1"]["errors"]["father_id"]
        assert by_name["Family 2"]["ok"]
        assert not by_name["Family 3"]["ok"] and "graduated" in by_name["Family 3"]["errors"]["father_id"]
        f2.refresh_from_db()
        assert f2.father_id == good.id and Family.objects.get(pk=f1.pk).father_id is None

    def test_one_person_cannot_lead_two_families_even_in_one_request(self):
        f1, f2 = Family.objects.create(name="Family 1"), Family.objects.create(name="Family 2")
        dad = senior("dad@finot.test", "M")
        res = self.admin().post(ASSIGN, {"assignments": [
            {"family_id": f1.id, "father_id": dad.id}, {"family_id": f2.id, "father_id": dad.id},
        ]}, format="json").json()
        assert res["applied"] == 1 and res["failed"] == 1
        assert "already leads a family" in res["results"][1]["errors"]["father_id"]

    def test_null_clears_a_parent_and_a_missing_key_keeps_it(self):
        dad, mum = senior("dad@finot.test", "M"), senior("mum@finot.test", "F")
        fam = Family.objects.create(name="Family 1", father=dad, mother=mum)
        self.admin().post(ASSIGN, {"assignments": [{"family_id": fam.id, "father_id": None}]}, format="json")
        fam.refresh_from_db()
        assert fam.father_id is None and fam.mother_id == mum.id

    def test_bad_requests(self):
        c = self.admin()
        assert c.post(ASSIGN, {}, format="json").status_code == 400
        assert c.post(ASSIGN, {"assignments": []}, format="json").status_code == 400
        res = c.post(ASSIGN, {"assignments": [{"family_id": 99999, "father_id": 1}, "x"]}, format="json").json()
        assert res["applied"] == 0 and res["failed"] == 2
        assert client_for(make_user("stu@finot.test", batch=2)).post(ASSIGN, {"assignments": []}, format="json").status_code == 403


@pytest.mark.django_db
def test_a_hundred_families_cost_only_a_few_queries():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    fams = [Family.objects.create(name=f"Family {i}") for i in range(30)]
    dads = [senior(f"d{i}@finot.test", "M") for i in range(30)]
    moms = [senior(f"m{i}@finot.test", "F") for i in range(30)]
    admin = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN, gender="F", batch=4))
    rows = [{"family_id": f.id, "father_id": d.id, "mother_id": m.id} for f, d, m in zip(fams, dads, moms)]
    with CaptureQueriesContext(connection) as q:
        res = admin.post(ASSIGN, {"assignments": rows}, format="json").json()
    assert res["applied"] == 30
    assert len(q.captured_queries) <= 15  # was about 10 per family (300 here)


@pytest.mark.django_db
def test_a_father_can_move_to_another_family_when_his_old_family_gets_someone_else():
    a, c = senior("a@finot.test", "M"), senior("c@finot.test", "M")
    f1, f2 = Family.objects.create(name="Family 1", father=a), Family.objects.create(name="Family 2")
    admin = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN, gender="F", batch=4))
    res = admin.post(ASSIGN, {"assignments": [
        {"family_id": f1.id, "father_id": c.id}, {"family_id": f2.id, "father_id": a.id},
    ]}, format="json").json()
    assert res["applied"] == 2 and res["failed"] == 0
    f1.refresh_from_db()
    f2.refresh_from_db()
    assert (f1.father_id, f2.father_id) == (c.id, a.id)


POOL = BASE + "families/parents/pool/"


@pytest.mark.django_db
class TestParentPool:
    def family_admin(self):
        return client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN, gender="F", batch=4))

    def test_the_family_admin_and_the_super_admin_can_both_choose_candidates(self):
        a, b = senior("a@finot.test", "M"), senior("b@finot.test", "F")
        assert self.family_admin().post(POOL, {"user_id": a.id, "note": "recommended by Aba Kebede"}, format="json").status_code == 201
        boss = client_for(make_user("boss@finot.test", Role.SUPER_ADMIN))
        assert boss.post(POOL, {"user_id": b.id}, format="json").status_code == 201
        data = boss.get(POOL).json()
        assert {c["email"] for c in data["chosen"]} == {"a@finot.test", "b@finot.test"}
        assert {c["status"] for c in data["chosen"]} == {"SELECTED"}
        assert {c["selected_by"] for c in data["chosen"]} == {"fam T", "boss T"}

    def test_the_requirements_are_always_checked(self):
        c = self.family_admin()
        young = senior("young@finot.test", "M", year=1)
        grad = senior("grad@finot.test", "F", year=5, status=StudentProfile.GRADUATED)
        nogender = senior("none@finot.test", None)
        for person in (young, grad, nogender):
            assert c.post(POOL, {"user_id": person.id}, format="json").status_code == 400
        assert c.post(POOL, {"user_id": 99999}, format="json").status_code == 400
        assert c.post(POOL, {}, format="json").status_code == 400

    def test_a_person_who_already_leads_a_family_or_is_a_child_cannot_be_chosen(self):
        dad, child = senior("dad@finot.test", "M"), senior("child@finot.test", "F", year=2)
        fam = Family.objects.create(name="Family 1", father=dad)
        FamilyMembership.objects.create(family=fam, student=child)
        c = self.family_admin()
        assert c.post(POOL, {"user_id": dad.id}, format="json").status_code == 400
        assert c.post(POOL, {"user_id": child.id}, format="json").status_code == 400

    def test_suggestions_exclude_the_chosen_and_follow_the_search(self):
        a, b = senior("abel@finot.test", "M"), senior("kebede@finot.test", "M")
        c = self.family_admin()
        c.post(POOL, {"user_id": a.id}, format="json")
        data = c.get(POOL).json()
        assert [s["email"] for s in data["suggestions"] if s["email"].endswith("@finot.test") and s["gender"] == "M"] == ["kebede@finot.test"]
        assert [s["email"] for s in c.get(POOL, {"search": "keb"}).json()["suggestions"]] == ["kebede@finot.test"]

    def test_training_is_marked_and_can_be_undone_and_choosing_twice_is_harmless(self):
        a = senior("a@finot.test", "M")
        c = self.family_admin()
        c.post(POOL, {"user_id": a.id}, format="json")
        assert c.post(POOL, {"user_id": a.id}, format="json").status_code == 200  # already chosen
        res = c.patch(f"{POOL}{a.id}/", {"status": "TRAINED"}, format="json").json()
        assert res["status"] == "TRAINED"
        from service.models import ParentCandidate

        assert ParentCandidate.objects.get(user=a).trained_at is not None
        assert c.patch(f"{POOL}{a.id}/", {"status": "SELECTED"}, format="json").json()["status"] == "SELECTED"
        assert ParentCandidate.objects.get(user=a).trained_at is None
        assert c.patch(f"{POOL}{a.id}/", {"status": "FLYING"}, format="json").status_code == 400
        assert c.patch(f"{POOL}9999/", {"status": "TRAINED"}, format="json").status_code == 404

    def test_a_candidate_can_be_removed_unless_they_lead_a_family(self):
        a, b = senior("a@finot.test", "M"), senior("b@finot.test", "M")
        c = self.family_admin()
        c.post(POOL, {"user_id": a.id}, format="json")
        c.post(POOL, {"user_id": b.id}, format="json")
        Family.objects.create(name="Family 1", father=b)
        assert c.delete(f"{POOL}{a.id}/").status_code == 204
        assert c.delete(f"{POOL}{b.id}/").status_code == 400
        assert c.delete(f"{POOL}{a.id}/").status_code == 404

    def test_students_cannot_use_it(self):
        s = client_for(make_user("stu@finot.test", batch=2, gender="M"))
        assert s.get(POOL).status_code == 403 and s.post(POOL, {"user_id": 1}, format="json").status_code == 403
