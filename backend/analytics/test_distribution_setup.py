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
