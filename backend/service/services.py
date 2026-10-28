from django.db.models import Q

from core.models import User
from student.models import StudentProfile
from .models import Family, FamilyMembership
from student.participation import participating_q


# Students per family. The father and mother are extra, so a family is about 11-12 people with its parents.
MAX_FAMILY_SIZE = 10


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
        participating_q(),  # a slip nobody has used is not a person to put in a family
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

def _family_info(family):
    from collections import Counter

    from .distribution import FamilyInfo

    sections, blocks, genders = Counter(), Counter(), Counter()
    count = 0
    for m in FamilyMembership.objects.filter(family=family).select_related("student__student_profile"):
        count += 1
        profile = getattr(m.student, "student_profile", None)
        if profile and profile.section is not None:
            sections[profile.section] += 1
        if profile and profile.dorm_block is not None:
            blocks[profile.dorm_block] += 1
        if m.student.gender:
            genders[m.student.gender] += 1
    return FamilyInfo(family.id, family.name, count, sections, blocks, genders)


def _student_infos(students):
    from .distribution import StudentInfo

    infos = []
    for user in students:
        profile = user.student_profile
        infos.append(StudentInfo(
            id=user.id,
            name=user.get_full_name() or user.username,
            gender=user.gender or None,
            section=profile.section,
            dorm_block=profile.dorm_block,
            dorm_room=profile.dorm_room,
        ))
    return infos


def build_distribution_plan(students, families):
    """
    students: queryset of unassigned fresher Users (with student_profile)
    families: queryset/list of Family
    Returns (Plan, {family_id: Family}, {student_id: User}) so the caller can display it.
    """
    from .distribution import plan_distribution

    families = list(families)
    students = list(students)
    plan = plan_distribution(_student_infos(students), [_family_info(f) for f in families], MAX_FAMILY_SIZE)
    return plan, {f.id: f for f in families}, {u.id: u for u in students}


student_infos = _student_infos  # public name for other modules


def unassigned_fresher_infos(**filters):
    """
    The same list as student_infos(get_unassigned_freshers(...)), but it reads only the 8 columns the distribution
    needs. Whole user and profile rows are about 20 times bigger, which made the preview take 10 to 20 seconds on a
    slow connection to the database.
    """
    from .distribution import StudentInfo

    rows = get_unassigned_freshers(**filters).values_list(
        "id", "first_name", "last_name", "username", "gender",
        "student_profile__section", "student_profile__dorm_block", "student_profile__dorm_room",
    )
    return [
        StudentInfo(id=pk, name=f"{first} {last}".strip() or username, gender=gender or None,
                    section=section, dorm_block=block, dorm_room=room)
        for pk, first, last, username, gender, section, block, room in rows
    ]


def next_family_names(count):
    """'Family 4', 'Family 5', ... continuing after the highest number already used."""
    import re

    existing = list(Family.objects.values_list("name", flat=True))
    taken = {n.strip().lower() for n in existing}
    numbers = [int(m.group(1)) for n in existing if (m := re.search(r"(\d+)\s*$", n))]
    number, names = max(numbers, default=0) + 1, []
    while len(names) < count:
        candidate = f"Family {number}"
        if candidate.lower() not in taken:
            names.append(candidate)
        number += 1
    return names


def build_auto_distribution_plan(students):
    """
    The system makes the families itself. Existing families that have room
    are filled first; as many new ones as needed are planned on top (nothing is saved here).
    New families get negative temporary ids. Returns (Plan, {family_id: Family}, [{"temp_id", "name"}]).
    """
    import math

    from .distribution import FamilyInfo, plan_distribution

    students = list(students)
    existing = list(Family.objects.order_by("name"))
    infos = [_family_info(f) for f in existing]
    free = sum(max(0, MAX_FAMILY_SIZE - i.current_size) for i in infos)
    new_count = math.ceil(max(0, len(students) - free) / MAX_FAMILY_SIZE)
    new_families = [{"temp_id": -(i + 1), "name": name} for i, name in enumerate(next_family_names(new_count))]
    infos += [FamilyInfo(f["temp_id"], f["name"]) for f in new_families]
    plan = plan_distribution(_student_infos(students), infos, MAX_FAMILY_SIZE)
    return plan, {f.id: f for f in existing}, new_families


def apply_distribution(pairs, user=None, max_size=MAX_FAMILY_SIZE):
    """
    pairs: iterable of (student_id, family_id) from a confirmed preview.
    Re-checks every pair (student still unassigned, family still has room)
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
            profile = getattr(student, "student_profile", None)
            if profile is None or profile.batch_year != 1 or profile.status != StudentProfile.IN_CAMPUS:
                skipped.append(f"{label}: only first-year students on campus are placed in families")
                continue
            size = sizes.setdefault(family.id, family.members.count())
            if size >= max_size:
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
    # Families this run created go away again, unless someone has since joined or been given a parent
    for family in batch.created_families.all():
        if not family.members.exists() and family.father_id is None and family.mother_id is None and not family.religious_father:
            family.delete()
    return removed
