"""
Smart family distribution.

plan_distribution() is a pure function (no database access) so it is easy to test:
it decides which student goes to which family, and the admin screen shows that plan
as a preview before anything is saved.

Rules:
  * a family with a gender only takes students of that gender (no gender = mixed);
  * a family never exceeds max_size;
  * family sizes are kept as even as possible (always fill the emptiest eligible family);
  * among equally empty families, prefer the one with the fewest students of the same
    gender, then from the same section, then from the same dorm block, so each family is a mix.
"""
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class StudentInfo:
    id: int
    name: str
    gender: Optional[str]
    section: Optional[int] = None
    dorm_block: Optional[int] = None
    dorm_room: Optional[int] = None


@dataclass
class FamilyInfo:
    id: int
    name: str
    gender: Optional[str]
    current_size: int = 0
    # section / dorm block of existing members, so new students spread against them
    sections: Counter = field(default_factory=Counter)
    blocks: Counter = field(default_factory=Counter)
    genders: Counter = field(default_factory=Counter)


@dataclass
class Plan:
    # family id -> students added to it
    assignments: dict
    # (student, reason)
    unplaced: list


def _accepts(family: FamilyInfo, student: StudentInfo) -> bool:
    return family.gender is None or student.gender is None or family.gender == student.gender


def plan_distribution(students, families, max_size) -> Plan:
    sizes = {f.id: f.current_size for f in families}
    sections = {f.id: Counter(f.sections) for f in families}
    blocks = {f.id: Counter(f.blocks) for f in families}
    genders = {f.id: Counter(f.genders) for f in families}
    assignments = {f.id: [] for f in families}
    unplaced = []

    # Students with fewer eligible families go first (gender-restricted pools fill before mixed ones);
    # then dorm / room / section order so students from the same place are dealt out one by one.
    def eligible_count(student):
        return sum(1 for f in families if _accepts(f, student))

    ordered = sorted(
        students,
        key=lambda s: (
            eligible_count(s),
            s.dorm_block if s.dorm_block is not None else 10**6,
            s.dorm_room if s.dorm_room is not None else 10**6,
            s.section if s.section is not None else 10**6,
            s.name,
        ),
    )

    for student in ordered:
        candidates = [f for f in families if _accepts(f, student) and sizes[f.id] < max_size]
        if not candidates:
            reason = (
                "no family accepts this gender"
                if eligible_count(student) == 0
                else "all matching families are full"
            )
            unplaced.append((student, reason))
            continue
        best = min(
            candidates,
            key=lambda f: (
                sizes[f.id],
                genders[f.id][student.gender] if student.gender else 0,
                sections[f.id][student.section] if student.section is not None else 0,
                blocks[f.id][student.dorm_block] if student.dorm_block is not None else 0,
                f.name,
            ),
        )
        assignments[best.id].append(student)
        sizes[best.id] += 1
        if student.gender:
            genders[best.id][student.gender] += 1
        if student.section is not None:
            sections[best.id][student.section] += 1
        if student.dorm_block is not None:
            blocks[best.id][student.dorm_block] += 1

    return Plan(assignments=assignments, unplaced=unplaced)
