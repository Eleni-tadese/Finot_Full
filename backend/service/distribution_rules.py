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
