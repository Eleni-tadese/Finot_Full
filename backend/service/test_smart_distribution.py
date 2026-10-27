import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from core.models import Role, UserRole
from service.distribution import FamilyInfo, StudentInfo, plan_distribution
from service.models import Family, FamilyDistributionBatch, FamilyMembership
from service.services import MAX_FAMILY_SIZE, apply_distribution, undo_distribution
from student.models import StudentProfile

User = get_user_model()


def students(n, gender="M", start=0, block=None, section=None):
    return [
        StudentInfo(id=start + i, name=f"S{start + i:03d}", gender=gender,
                    dorm_block=block if block is not None else (i % 3) + 1,
                    section=section if section is not None else (i % 4) + 1)
        for i in range(n)
    ]


def sizes(plan, families):
    return {f.id: f.current_size + len(plan.assignments[f.id]) for f in families}


class TestAlgorithm:
    def test_sizes_are_even(self):
        families = [FamilyInfo(i, f"F{i}") for i in range(1, 5)]
        plan = plan_distribution(students(22), families, MAX_FAMILY_SIZE)
        counts = sizes(plan, families).values()
        assert max(counts) - min(counts) <= 1 and sum(counts) == 22 and not plan.unplaced

    def test_existing_members_are_taken_into_account(self):
        families = [FamilyInfo(1, "A", current_size=10), FamilyInfo(2, "B", current_size=0)]
        plan = plan_distribution(students(6), families, MAX_FAMILY_SIZE)
        assert len(plan.assignments[2]) == 6 and not plan.assignments[1]

    def test_never_exceeds_max_and_reports_unplaced(self):
        families = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        plan = plan_distribution(students(40), families, MAX_FAMILY_SIZE)
        assert all(len(v) <= MAX_FAMILY_SIZE for v in plan.assignments.values())
        assert len(plan.unplaced) == 40 - 2 * MAX_FAMILY_SIZE
        assert plan.unplaced[0][1] == "all families are full"

    def test_sections_are_spread_across_families(self):
        families = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        group = students(4, section=1, block=1) + students(4, section=2, block=1, start=50)
        plan = plan_distribution(group, families, MAX_FAMILY_SIZE)
        for f in families:
            assert {s.section for s in plan.assignments[f.id]} == {1, 2}

    def test_deterministic(self):
        families = [FamilyInfo(i, f"F{i}") for i in range(1, 4)]
        a = plan_distribution(students(20), families, MAX_FAMILY_SIZE)
        b = plan_distribution(list(reversed(students(20))), families, MAX_FAMILY_SIZE)
        assert {k: [s.id for s in v] for k, v in a.assignments.items()} == {k: [s.id for s in v] for k, v in b.assignments.items()}


def make_fresher(i, gender="M"):
    user = User.objects.create_user(
        username=f"f{i}@finot.test", email=f"f{i}@finot.test", password="x",
        first_name=f"Fresh{i}", last_name="T", gender=gender,
    )
    StudentProfile.objects.update_or_create(
        user=user, defaults={"batch_year": 1, "status": StudentProfile.IN_CAMPUS, "dorm_block": (i % 3) + 1, "section": (i % 4) + 1},
    )
    return user


def make_super():
    user = User.objects.create_user(username="boss@finot.test", email="boss@finot.test", password="x", first_name="B", last_name="T")
    UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
    user.refresh_from_db()
    return user


@pytest.mark.django_db
class TestAdminFlow:
    URL = "/admin/service/family/smart-distribute/"

    def setup_method(self):
        self.fam1 = Family.objects.create(name="Fam 1")
        self.fam2 = Family.objects.create(name="Fam 2")
        self.fresh = [make_fresher(i) for i in range(10)]
        self.client = Client()
        self.client.force_login(make_super())

    def preview(self, **extra):
        return self.client.post(self.URL, {"step": "preview", "families": [self.fam1.pk, self.fam2.pk], **extra})

    def test_form_page_renders(self):
        res = self.client.get(self.URL)
        assert res.status_code == 200 and b"Preview distribution" in res.content

    def test_preview_saves_nothing(self):
        res = self.preview()
        assert res.status_code == 200 and b"Confirm and assign 10" in res.content
        assert FamilyMembership.objects.count() == 0

    def test_confirm_assigns_evenly_then_undo(self):
        self.preview()
        self.client.post(self.URL, {"step": "confirm"})
        assert FamilyMembership.objects.count() == 10
        assert {self.fam1.members.count(), self.fam2.members.count()} == {5}
        batch = FamilyDistributionBatch.objects.get()
        assert FamilyMembership.objects.filter(batch=batch).count() == 10

        self.client.post(self.URL, {"step": "undo", "batch": batch.pk})
        assert FamilyMembership.objects.count() == 0
        batch.refresh_from_db()
        assert batch.undone_at is not None
        assert undo_distribution(batch) == 0  # second undo does nothing

    def test_confirm_without_preview_does_nothing(self):
        self.client.post(self.URL, {"step": "confirm"})
        assert FamilyMembership.objects.count() == 0

    def test_stale_preview_cannot_overfill_or_double_assign(self):
        pairs = [(u.id, self.fam1.id) for u in self.fresh]
        FamilyMembership.objects.create(family=self.fam1, student=self.fresh[0])  # already placed since the preview
        batch, applied, skipped = apply_distribution(pairs)
        assert applied == 9 and len(skipped) == 1 and "already in a family" in skipped[0]
        # fam1 now has 10; a second stale run with 10 more students may only fill up to the limit
        extra = [make_fresher(100 + i) for i in range(10)]
        _, applied2, skipped2 = apply_distribution([(u.id, self.fam1.id) for u in extra])
        assert applied2 == MAX_FAMILY_SIZE - 10 and self.fam1.members.count() == MAX_FAMILY_SIZE

    def test_filter_by_gender(self):
        make_fresher(50, "F")
        res = self.preview(gender="F")
        assert b"Confirm and assign 1 " in res.content

    def test_non_super_admin_blocked(self):
        sa = User.objects.create_user(username="sa@finot.test", email="sa@finot.test", password="x", first_name="S", last_name="A")
        UserRole.objects.create(user=sa, role=Role.objects.get_or_create(name=Role.SERVICE_ADMIN)[0])
        c = Client()
        c.force_login(User.objects.get(pk=sa.pk))
        res = c.post(self.URL, {"step": "confirm"})
        assert res.status_code in (302, 403)
        assert FamilyMembership.objects.count() == 0
