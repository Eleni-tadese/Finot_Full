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
