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
    """
    What the ratio f:m gives. The placement deals women and men out evenly over ALL the families, each family taking
    at most f women and m men, so only the students beyond that room are left over (`left_*`). `families_full` is how
    many families could be filled to exactly the ratio.
    """
    full = min(families, females // female_per_family, males // male_per_family)
    left_f = max(0, females - families * female_per_family)
    left_m = max(0, males - families * male_per_family)
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


FACTORS = ("section", "dorm", "gender")


def normalise_priority(priority):
    """The Family Admin's order of the factors (first = counts most). Anything left out follows in the usual order."""
    order = []
    for name in priority or ():
        if name not in FACTORS:
            raise ValueError(f"Unknown factor '{name}'. Use section, dorm or gender.")
        if name not in order:
            order.append(name)
    return order + [name for name in FACTORS if name not in order]


class _Placement:
    """The running state of one placement: who is in which family, and how each factor is spread."""

    def __init__(self, families, section_mode, dorm_mode, priority):
        self.families = families
        self.modes = {"section": section_mode, "dorm": dorm_mode}
        self.priority = normalise_priority(priority)
        self.assignments = {f.id: [] for f in families}
        self.total = {f.id: f.current_size for f in families}
        self.have = {f.id: {"F": f.genders.get("F", 0), "M": f.genders.get("M", 0)} for f in families}
        self.in_section = {f.id: Counter(f.sections) for f in families}
        self.in_block = {f.id: Counter(f.blocks) for f in families}

    def order(self, student):
        """Students are dealt out in this order: a factor that must stay together is handled first, most important first."""
        values = {"section": student.section, "dorm": student.dorm_block}
        grouped = [
            (values[name] if values[name] is not None else 10**6) if self.modes[name] == "together" else 0
            for name in self.priority if name in self.modes
        ]
        return (
            *grouped,
            student.dorm_block if student.dorm_block is not None else 10**6,
            student.dorm_room if student.dorm_room is not None else 10**6,
            student.section if student.section is not None else 10**6,
            student.name,
        )

    def pick(self, student, candidates):
        """The best family among `candidates` for this student, by the factors in the Family Admin's order."""

        def pull(mode, counts, value):
            n = counts[value] if value is not None else 0
            return n if mode == "mix" else -n if mode == "together" else 0

        def terms(f):
            return {
                "section": pull(self.modes["section"], self.in_section[f.id], student.section),
                "dorm": pull(self.modes["dorm"], self.in_block[f.id], student.dorm_block),
                "gender": self.have[f.id][student.gender] if student.gender in ("F", "M") else 0,
            }

        return min(candidates, key=lambda f: (*[terms(f)[name] for name in self.priority], self.total[f.id], f.name))

    def add(self, family, student):
        self.assignments[family.id].append(student)
        self.total[family.id] += 1
        if student.gender in ("F", "M"):
            self.have[family.id][student.gender] += 1
        if student.section is not None:
            self.in_section[family.id][student.section] += 1
        if student.dorm_block is not None:
            self.in_block[family.id][student.dorm_block] += 1


def plan_by_ratio(students, families, size, female_per_family, male_per_family,
                  section_mode="ignore", dorm_mode="ignore", priority=None):
    """
    Place students so that each family gets `female_per_family` women and `male_per_family` men (counting the people
    already in it), never more than `size` in all. A student for whom every family is full for their gender (or who
    has no gender on file) is not placed: the Plan lists them as `unplaced` with the reason, and `place_remaining`
    puts them in at the end.

    section_mode and dorm_mode (what to do with the university section and the dorm block, from the Family Admin):
      "mix"      students of one section (or dorm) are spread over different families;
      "together" students of one section (or dorm) are put in the same family (when it is full, the rest go
                 together to the next one);
      "ignore"   it is not used.
    priority: the order of "section", "dorm", "gender" (first counts most) when the factors pull in different ways.
    The ratio and the size are always hard rules.
    """
    from .distribution import Plan

    quota = {"F": female_per_family, "M": male_per_family}
    state = _Placement(families, section_mode, dorm_mode, priority)
    unplaced = []
    for student in sorted(students, key=state.order):
        g = student.gender
        if g not in quota:
            unplaced.append((student, "no gender on file"))
            continue
        open_ = [f for f in families if state.have[f.id][g] < quota[g] and state.total[f.id] < size]
        if not open_:
            unplaced.append((student, "every family already has its share of this gender"))
            continue
        state.add(state.pick(student, open_), student)
    return Plan(assignments=state.assignments, unplaced=unplaced)


def place_remaining(plan, families, size, section_mode="ignore", dorm_mode="ignore", priority=None):
    """
    The last step: the students the ratio left over go into the families that still have room (the size is the only
    hard rule now). A family is chosen by the same factors, so the result stays as fair as possible. Returns a new
    Plan; whoever still has no room stays in `unplaced`.
    """
    from .distribution import Plan

    state = _Placement(families, section_mode, dorm_mode, priority)
    for family in families:
        for student in plan.assignments.get(family.id, []):
            state.add(family, student)
    still = []
    for student, _reason in sorted(plan.unplaced, key=lambda row: state.order(row[0])):
        open_ = [f for f in families if state.total[f.id] < size]
        if not open_:
            still.append((student, "all families are full"))
            continue
        state.add(state.pick(student, open_), student)
    return Plan(assignments=state.assignments, unplaced=still)
