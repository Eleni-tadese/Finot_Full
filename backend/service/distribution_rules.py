"""
Helpers for the Family Admin's yearly distribution rules (pure functions, no database).

The Family Admin sees, before the preview:
  * how many families the students make, for the chosen family size (`family_count`);
  * the possible male:female ratios for one family, with what each ratio would leave over (`suggest_ratios`).

A ratio is "females per family : males per family"; the two numbers add up to the family size. Every family has both
genders, so each number is at least 1. A ratio that the students cannot fill for every family is still offered (the
Family Admin sees how many students would be left over and can place them at the end).
"""
import math
from collections import Counter


def family_count(students, size):
    """How many families `students` fill when each holds `size` students (the last one may be smaller)."""
    if size < 2:
        raise ValueError("A family needs at least 2 students.")
    return math.ceil(students / size) if students > 0 else 0


def ratio_outcome(females, males, families, female_per_family, male_per_family):
    """What the ratio f:m gives: how many families can be filled to the ratio and who is left over."""
    full = min(families, females // female_per_family, males // male_per_family)
    left_f = females - full * female_per_family
    left_m = males - full * male_per_family
    return {
        "female": female_per_family,
        "male": male_per_family,
        "families_full": full,
        "left_female": left_f,
        "left_male": left_m,
        "left_total": left_f + left_m,
    }


def suggest_ratios(females, males, families, size, how_many=3):
    """
    The best ratios first: the one closest to the real share of women and men, and the ones next to it, ordered by
    how few students they leave over. Returns [] when there is nothing to plan.
    """
    total = females + males
    if total <= 0 or families <= 0 or size < 2:
        return []
    ideal = size * females / total
    options = [ratio_outcome(females, males, families, f, size - f) for f in range(1, size)]
    options.sort(key=lambda o: (o["left_total"], abs(o["female"] - ideal), o["female"]))
    return options[:how_many]


def plan_by_ratio(students, families, size, female_per_family, male_per_family, section_mode="ignore", dorm_mode="ignore"):
    """
    Place students so that each family gets `female_per_family` women and `male_per_family` men (counting the people
    already in it), never more than `size` in all. Women are dealt out one by one to the family that has the fewest
    women so far, men the same way, so the families stay even. A student for whom every family is full for their
    gender (or who has no gender on file) is not placed: the Plan lists them as `unplaced` with the reason, and they
    are placed at the end (see the remaining-students step).

    section_mode and dorm_mode (what to do with the university section and the dorm block, from the Family Admin):
      "mix"      students of one section (or dorm) are spread over different families;
      "together" students of one section (or dorm) are put in the same family (when it is full, the rest go
                 together to the next one);
      "ignore"   it is not used.
    """
    from .distribution import Plan

    quota = {"F": female_per_family, "M": male_per_family}
    assignments = {f.id: [] for f in families}
    total = {f.id: f.current_size for f in families}
    have = {f.id: {"F": f.genders.get("F", 0), "M": f.genders.get("M", 0)} for f in families}
    in_section = {f.id: Counter(f.sections) for f in families}
    in_block = {f.id: Counter(f.blocks) for f in families}
    unplaced = []

    def order(s):
        return (
            (s.section if s.section is not None else 10**6) if section_mode == "together" else 0,
            (s.dorm_block if s.dorm_block is not None else 10**6) if dorm_mode == "together" else 0,
            s.dorm_block if s.dorm_block is not None else 10**6,
            s.dorm_room if s.dorm_room is not None else 10**6,
            s.section if s.section is not None else 10**6,
            s.name,
        )

    for student in sorted(students, key=order):
        g = student.gender
        if g not in quota:
            unplaced.append((student, "no gender on file"))
            continue
        open_ = [f for f in families if have[f.id][g] < quota[g] and total[f.id] < size]
        if not open_:
            unplaced.append((student, "every family already has its share of this gender"))
            continue
        def pull(mode, counts, value):
            n = counts[value] if value is not None else 0
            return n if mode == "mix" else -n if mode == "together" else 0

        best = min(open_, key=lambda f: (
            pull(section_mode, in_section[f.id], student.section),
            pull(dorm_mode, in_block[f.id], student.dorm_block),
            have[f.id][g], total[f.id], f.name,
        ))
        assignments[best.id].append(student)
        have[best.id][g] += 1
        total[best.id] += 1
        if student.section is not None:
            in_section[best.id][student.section] += 1
        if student.dorm_block is not None:
            in_block[best.id][student.dorm_block] += 1
    return Plan(assignments=assignments, unplaced=unplaced)
