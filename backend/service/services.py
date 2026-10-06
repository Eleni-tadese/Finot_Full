from django.db.models import Q

from core.models import User
from student.models import StudentProfile
from .models import Family, FamilyMembership


MAX_FAMILY_SIZE = 15


def get_filter_options():
    """
    Returns distinct values for filter dropdowns,
    sourced from unassigned fresher StudentProfiles.
    """
    freshers = StudentProfile.objects.filter(
        batch_year=1,
        status=StudentProfile.IN_CAMPUS,
    ).exclude(
        user__family_membership__isnull=False,
    )

    return {
        "dorm_blocks": sorted(
            freshers.exclude(dorm_block__isnull=True)
            .values_list("dorm_block", flat=True)
            .distinct()
        ),
        "dorm_rooms": sorted(
            freshers.exclude(dorm_room__isnull=True)
            .values_list("dorm_room", flat=True)
            .distinct()
        ),
        "sections": sorted(
            freshers.exclude(section__isnull=True)
            .values_list("section", flat=True)
            .distinct()
        ),
    }


def get_unassigned_freshers(gender=None, dorm_block=None, dorm_room=None, section=None):
    """
    Returns a filtered queryset of unassigned fresher students.
    All filter parameters are optional — omit to skip that filter.
    """
    qs = User.objects.filter(
        student_profile__batch_year=1,
        student_profile__status=StudentProfile.IN_CAMPUS,
    ).exclude(
        family_membership__isnull=False,
    ).select_related("student_profile")

    if gender:
        qs = qs.filter(gender=gender)

    if dorm_block is not None:
        qs = qs.filter(student_profile__dorm_block=dorm_block)

    if dorm_room is not None:
        qs = qs.filter(student_profile__dorm_room=dorm_room)

    if section is not None:
        qs = qs.filter(student_profile__section=section)

    return qs.order_by(
        "student_profile__dorm_block",
        "student_profile__dorm_room",
        "student_profile__section",
        "first_name",
    )


def assign_students_to_family(family, student_ids):
    """
    Assigns selected students to a family by creating FamilyMembership records.
    Skips students who already have a family (OneToOne safety).

    Returns:
        dict with keys:
            - assigned_count (int): Successfully assigned.
            - skipped_names (list[str]): Students skipped (already in a family).
            - warnings (list[str]): Any issues.
    """
    warnings = []
    skipped_names = []
    memberships = []

    current_count = family.members.count()
    available_slots = MAX_FAMILY_SIZE - current_count

    if available_slots <= 0:
        return {
            "assigned_count": 0,
            "skipped_names": [],
            "warnings": [f"Family '{family.name}' is already full ({current_count}/{MAX_FAMILY_SIZE})."],
        }

    students = User.objects.filter(id__in=student_ids).select_related("student_profile")

    for student in students:
        # Check if student already has a family
        if hasattr(student, "family_membership"):
            skipped_names.append(f"{student.get_full_name() or student.username} (already in a family)")
            continue

        if len(memberships) >= available_slots:
            skipped_names.append(
                f"{student.get_full_name() or student.username} (family at max capacity)"
            )
            continue

        memberships.append(FamilyMembership(family=family, student=student))

    if memberships:
        FamilyMembership.objects.bulk_create(memberships)

    if skipped_names:
        warnings.append(f"{len(skipped_names)} student(s) were skipped.")

    return {
        "assigned_count": len(memberships),
        "skipped_names": skipped_names,
        "warnings": warnings,
    }


# ── Smart distribution (see distribution.py for the rules) ─────────────────

def build_distribution_plan(students, families):
    """
    students: queryset of unassigned fresher Users (with student_profile)
    families: queryset/list of Family
    Returns (Plan, {family_id: Family}, {student_id: User}) so the caller can display it.
    """
    from collections import Counter

    from .distribution import FamilyInfo, StudentInfo, plan_distribution

    families = list(families)
    infos = []
    for family in families:
        members = FamilyMembership.objects.filter(family=family).select_related("student__student_profile")
        sections, blocks = Counter(), Counter()
        count = 0
        for m in members:
            count += 1
            profile = getattr(m.student, "student_profile", None)
            if profile and profile.section is not None:
                sections[profile.section] += 1
            if profile and profile.dorm_block is not None:
                blocks[profile.dorm_block] += 1
        infos.append(FamilyInfo(family.id, family.name, family.gender or None, count, sections, blocks))

    students = list(students)
    student_infos = []
    for user in students:
        profile = user.student_profile
        student_infos.append(StudentInfo(
            id=user.id,
            name=user.get_full_name() or user.username,
            gender=user.gender or None,
            section=profile.section,
            dorm_block=profile.dorm_block,
            dorm_room=profile.dorm_room,
        ))
    plan = plan_distribution(student_infos, infos, MAX_FAMILY_SIZE)
    return plan, {f.id: f for f in families}, {u.id: u for u in students}


def apply_distribution(pairs, user=None):
    """
    pairs: iterable of (student_id, family_id) from a confirmed preview.
    Re-checks every pair (student still unassigned, family still has room, gender still fits)
    so a stale preview can never overfill a family. Everything happens in one transaction.

    Returns (batch, applied_count, skipped_messages).
    """
    from django.db import transaction

    from .models import FamilyDistributionBatch

    skipped = []
    with transaction.atomic():
        batch = FamilyDistributionBatch.objects.create(created_by=user)
        sizes = {}
        applied = 0
        for student_id, family_id in pairs:
            family = Family.objects.select_for_update().filter(pk=family_id).first()
            student = User.objects.filter(pk=student_id).first()
            if family is None or student is None:
                skipped.append(f"#{student_id}: student or family no longer exists")
                continue
            label = student.get_full_name() or student.username
            if FamilyMembership.objects.filter(student=student).exists():
                skipped.append(f"{label}: already in a family")
                continue
            if family.gender and student.gender and family.gender != student.gender:
                skipped.append(f"{label}: gender does not match {family.name}")
                continue
            size = sizes.setdefault(family.id, family.members.count())
            if size >= MAX_FAMILY_SIZE:
                skipped.append(f"{label}: {family.name} is full")
                continue
            FamilyMembership.objects.create(family=family, student=student, batch=batch)
            sizes[family.id] = size + 1
            applied += 1
        if applied == 0:
            transaction.set_rollback(True)
            batch = None
    return batch, applied, skipped


def undo_distribution(batch):
    """Remove every membership created by this batch. Returns the number removed."""
    from django.utils import timezone

    if batch.undone_at is not None:
        return 0
    removed, _ = FamilyMembership.objects.filter(batch=batch).delete()
    batch.undone_at = timezone.now()
    batch.save(update_fields=["undone_at"])
    return removed
