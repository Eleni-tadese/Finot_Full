import pytest

from analytics.test_console import BASE, client_for, make_user
from core.models import Role
from student.models import StudentProfile

URL = BASE + "families/distribution/setup/"


def fresh(n, women, start=0):
    for i in range(n):
        u = make_user(f"fr{start + i}@finot.test", gender="F" if i < women else "M", batch=1)
        StudentProfile.objects.filter(user=u).update(
            batch_year=1, status=StudentProfile.IN_CAMPUS, dorm_block=(i % 4) + 1, section=(i % 2) + 1)


@pytest.mark.django_db
class TestDistributionSetup:
    def test_100_students_of_10_make_10_families_with_ratio_suggestions(self):
        fresh(100, women=50)
        res = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN)).get(URL)
        assert res.status_code == 200
        data = res.json()
        assert data["students"] == {"total": 100, "women": 50, "men": 50, "no_gender": 0}
        assert data["size"] == 10 and data["default_size"] == 10 and data["families"] == 10
        assert (data["ratios"][0]["female"], data["ratios"][0]["male"]) == (5, 5)
        assert data["ratios"][0]["left_total"] == 0
        assert [row["count"] for row in data["sections"]] == [50, 50]
        assert [row["count"] for row in data["dorm_blocks"]] == [25, 25, 25, 25]

    def test_the_family_size_can_be_changed(self):
        fresh(100, women=50)
        data = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN)).get(URL, {"size": 8}).json()
        assert data["size"] == 8 and data["families"] == 13  # 100 / 8 rounded up

    def test_a_bad_size_is_refused(self):
        c = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN))
        for bad in ("abc", "1", "500"):
            assert c.get(URL, {"size": bad}).status_code == 400

    def test_only_the_family_admin_and_super_admin_see_it(self):
        assert client_for(make_user("stu@finot.test", batch=2)).get(URL).status_code == 403
        assert client_for(make_user("boss@finot.test", Role.SUPER_ADMIN)).get(URL).status_code == 200

    def test_no_students_means_no_families_and_no_suggestions(self):
        data = client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN)).get(URL).json()
        assert data["students"]["total"] == 0 and data["families"] == 0 and data["ratios"] == []


PLAN = BASE + "families/distribution/plan/"


def rules(**over):
    base = {"size": 10, "female_per_family": 5, "male_per_family": 5, "section_mode": "ignore", "dorm_mode": "ignore"}
    base.update(over)
    return base


@pytest.mark.django_db
class TestDistributionPlan:
    def admin(self):
        return client_for(make_user("fam@finot.test", Role.FAMILY_ADMIN))

    def test_100_students_ratio_5_5_makes_10_even_families_and_saves_nothing(self):
        from service.models import Family, FamilyMembership

        fresh(100, women=50)
        data = self.admin().post(PLAN, rules(), format="json").json()
        assert len(data["rows"]) == 10 and data["remaining"] == []
        assert all((r["women"], r["men"], r["total"]) == (5, 5, 10) for r in data["rows"])
        assert [f["name"] for f in data["new_families"]][:2] == ["Family 1", "Family 2"]
        assert data["summary"]["placed"] == 100 and len(data["pairs"]) == 100
        assert Family.objects.count() == 0 and FamilyMembership.objects.count() == 0  # a preview saves nothing

    def test_students_the_ratio_leaves_over_are_listed_then_placed_on_request(self):
        fresh(100, women=33)  # 33 women and 67 men with ratio 3:7
        admin = self.admin()
        first = admin.post(PLAN, rules(female_per_family=3, male_per_family=7), format="json").json()
        assert first["summary"]["remaining"] == 3 and all(r["gender"] == "F" for r in first["remaining"])
        done = admin.post(PLAN, rules(female_per_family=3, male_per_family=7, place_remaining=True), format="json").json()
        assert done["remaining"] == [] and all(r["total"] == 10 for r in done["rows"])

    def test_section_together_keeps_each_section_in_its_own_family(self):
        fresh(100, women=50)  # two sections of 50
        data = self.admin().post(PLAN, rules(section_mode="together"), format="json").json()
        assert all(len(r["sections"]) == 1 for r in data["rows"])

    def test_bad_rules_are_refused(self):
        fresh(20, women=10)
        c = self.admin()
        assert c.post(PLAN, rules(female_per_family=6, male_per_family=6), format="json").status_code == 400  # 12 > 10
        assert c.post(PLAN, rules(section_mode="sideways"), format="json").status_code == 400
        assert c.post(PLAN, rules(priority=["colour"]), format="json").status_code == 400
        assert c.post(PLAN, {"size": 10}, format="json").status_code == 400  # no ratio
        assert c.post(PLAN, rules(size="x"), format="json").status_code == 400

    def test_nobody_waiting_is_a_clear_error_and_students_cannot_use_it(self):
        assert self.admin().post(PLAN, rules(), format="json").status_code == 400
        assert client_for(make_user("stu@finot.test", batch=2)).post(PLAN, rules(), format="json").status_code == 403
