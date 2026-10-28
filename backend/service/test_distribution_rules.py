import pytest

from service.distribution_rules import family_count, ratio_outcome, suggest_ratios


class TestFamilyCount:
    def test_100_students_of_10_make_10_families(self):
        assert family_count(100, 10) == 10

    def test_a_smaller_last_family_counts(self):
        assert family_count(103, 10) == 11
        assert family_count(0, 10) == 0

    def test_size_must_be_at_least_2(self):
        with pytest.raises(ValueError):
            family_count(10, 1)


class TestSuggestRatios:
    def test_50_women_and_50_men_give_5_to_5_first(self):
        first = suggest_ratios(50, 50, 10, 10)[0]
        assert (first["female"], first["male"]) == (5, 5)
        assert first["families_full"] == 10 and first["left_total"] == 0

    def test_30_women_and_70_men_give_three_options_3_to_7_first(self):
        options = suggest_ratios(30, 70, 10, 10)
        assert len(options) == 3
        assert (options[0]["female"], options[0]["male"]) == (3, 7) and options[0]["left_total"] == 0
        # the other options leave students over, and say who
        assert all(o["left_total"] > 0 for o in options[1:])
        assert all(o["female"] + o["male"] == 10 for o in options)

    def test_every_family_has_both_genders(self):
        for o in suggest_ratios(5, 95, 10, 10, how_many=9):
            assert o["female"] >= 1 and o["male"] >= 1

    def test_leftovers_are_counted(self):
        o = ratio_outcome(30, 70, 10, 2, 8)  # 2:8 fills 8 families (16 women, 64 men)
        assert o["families_full"] == 8 and o["left_female"] == 14 and o["left_male"] == 6 and o["left_total"] == 20

    def test_nothing_to_plan(self):
        assert suggest_ratios(0, 0, 5, 10) == []
        assert suggest_ratios(10, 10, 0, 10) == []


from service.distribution import FamilyInfo, StudentInfo  # noqa: E402
from service.distribution_rules import plan_by_ratio  # noqa: E402


def people(women, men):
    rows = [StudentInfo(id=i, name=f"W{i:03d}", gender="F", section=i % 4 + 1, dorm_block=i % 3 + 1) for i in range(women)]
    rows += [StudentInfo(id=1000 + i, name=f"M{i:03d}", gender="M", section=i % 4 + 1, dorm_block=i % 3 + 1) for i in range(men)]
    return rows


def makeup(plan, family_id):
    members = plan.assignments[family_id]
    return sum(1 for s in members if s.gender == "F"), sum(1 for s in members if s.gender == "M")


class TestPlanByRatio:
    def test_50_and_50_give_every_family_5_and_5(self):
        families = [FamilyInfo(i, f"Family {i}") for i in range(1, 11)]
        plan = plan_by_ratio(people(50, 50), families, 10, 5, 5)
        assert not plan.unplaced
        assert all(makeup(plan, f.id) == (5, 5) for f in families)

    def test_30_and_70_give_every_family_3_and_7(self):
        families = [FamilyInfo(i, f"Family {i}") for i in range(1, 11)]
        plan = plan_by_ratio(people(30, 70), families, 10, 3, 7)
        assert not plan.unplaced
        assert all(makeup(plan, f.id) == (3, 7) for f in families)

    def test_students_that_do_not_fit_the_ratio_are_listed_as_remaining(self):
        families = [FamilyInfo(i, f"Family {i}") for i in range(1, 11)]
        plan = plan_by_ratio(people(33, 67), families, 10, 3, 7)  # 3 women and no men over
        assert len(plan.unplaced) == 3 and all(s.gender == "F" for s, _ in plan.unplaced)
        sizes = sorted(len(v) for v in plan.assignments.values())
        assert sizes == [9, 9, 9, 10, 10, 10, 10, 10, 10, 10]  # the 3 short families are the ones with 6 men

    def test_the_size_is_never_exceeded(self):
        families = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        plan = plan_by_ratio(people(10, 10), families, 6, 4, 4)  # the ratio asks for 8 but the size is 6
        assert all(len(v) <= 6 for v in plan.assignments.values())

    def test_existing_members_count_towards_the_ratio(self):
        from collections import Counter

        families = [FamilyInfo(1, "A", current_size=4, genders=Counter({"F": 4})), FamilyInfo(2, "B")]
        plan = plan_by_ratio(people(4, 4), families, 8, 4, 4)
        assert makeup(plan, 1)[0] == 0  # family A already has its 4 women, so none are added
        assert makeup(plan, 2)[0] == 4  # all 4 women go to B
        assert sum(makeup(plan, 1)) + 4 <= 8 and sum(makeup(plan, 2)) <= 8 and not plan.unplaced

    def test_a_student_without_gender_is_left_for_the_end(self):
        families = [FamilyInfo(1, "A")]
        plan = plan_by_ratio([StudentInfo(id=1, name="X", gender=None)], families, 10, 5, 5)
        assert plan.unplaced[0][1] == "no gender on file"


def sections_per_family(plan):
    from collections import Counter

    return {fid: Counter(s.section for s in members) for fid, members in plan.assignments.items()}


class TestSectionModes:
    def families(self, n):
        return [FamilyInfo(i, f"Family {i}") for i in range(1, n + 1)]

    def test_ignore_keeps_the_ratio_only(self):
        fams = self.families(4)
        plan = plan_by_ratio(people(20, 20), fams, 10, 5, 5, section_mode="ignore")
        assert all(makeup(plan, f.id) == (5, 5) for f in fams) and not plan.unplaced

    def test_mix_spreads_every_section_over_the_families(self):
        fams = self.families(4)
        plan = plan_by_ratio(people(20, 20), fams, 10, 5, 5, section_mode="mix")  # 4 sections of 10, 4 families
        assert all(makeup(plan, f.id) == (5, 5) for f in fams)  # the ratio still holds
        per = sections_per_family(plan)
        for section in (1, 2, 3, 4):
            counts = [per[f.id][section] for f in fams]
            assert max(counts) - min(counts) <= 1 and sum(counts) == 10

    def test_together_puts_a_whole_section_in_one_family(self):
        fams = self.families(4)
        plan = plan_by_ratio(people(20, 20), fams, 10, 5, 5, section_mode="together")
        assert all(makeup(plan, f.id) == (5, 5) for f in fams)
        per = sections_per_family(plan)
        assert all(len(per[f.id]) == 1 for f in fams)  # every family holds exactly one section

    def test_together_keeps_the_rest_of_a_big_section_together_in_the_next_family(self):
        # one section of 12 (6 women, 6 men), families of 10 with 5:5: ten stay together, the other two go together
        students = [StudentInfo(id=i, name=f"W{i}", gender="F", section=1) for i in range(6)]
        students += [StudentInfo(id=100 + i, name=f"M{i}", gender="M", section=1) for i in range(6)]
        fams = self.families(3)
        plan = plan_by_ratio(students, fams, 10, 5, 5, section_mode="together")
        used = sorted(len(m) for m in plan.assignments.values() if m)
        assert used == [2, 10] and not plan.unplaced


def by_dorm(women, men, blocks):
    rows = [StudentInfo(id=i, name=f"W{i:03d}", gender="F", dorm_block=i % blocks + 1, section=1) for i in range(women)]
    rows += [StudentInfo(id=1000 + i, name=f"M{i:03d}", gender="M", dorm_block=i % blocks + 1, section=1) for i in range(men)]
    return rows


def blocks_per_family(plan):
    from collections import Counter

    return {fid: Counter(s.dorm_block for s in members) for fid, members in plan.assignments.items()}


class TestDormModes:
    def families(self, n):
        return [FamilyInfo(i, f"Family {i}") for i in range(1, n + 1)]

    def test_mix_spreads_every_dorm_over_the_families(self):
        fams = self.families(4)
        plan = plan_by_ratio(by_dorm(20, 20, 4), fams, 10, 5, 5, dorm_mode="mix")  # 4 dorm blocks of 10
        assert all(makeup(plan, f.id) == (5, 5) for f in fams)
        per = blocks_per_family(plan)
        for block in (1, 2, 3, 4):
            counts = [per[f.id][block] for f in fams]
            assert max(counts) - min(counts) <= 1 and sum(counts) == 10

    def test_together_puts_a_whole_dorm_in_one_family(self):
        fams = self.families(4)
        plan = plan_by_ratio(by_dorm(20, 20, 4), fams, 10, 5, 5, dorm_mode="together")
        assert all(makeup(plan, f.id) == (5, 5) for f in fams)
        assert all(len(b) == 1 for b in blocks_per_family(plan).values())

    def test_the_two_modes_can_differ_in_one_run(self):
        # section together AND dorm mixed: students of a section share a family while each family has several dorms
        students = []
        for i in range(40):
            students.append(StudentInfo(id=i, name=f"S{i:03d}", gender="F" if i % 2 == 0 else "M", section=i // 10 + 1, dorm_block=i % 4 + 1))
        fams = self.families(4)
        plan = plan_by_ratio(students, fams, 10, 5, 5, section_mode="together", dorm_mode="mix")
        assert all(len(c) == 1 for c in sections_per_family(plan).values())  # one section per family
        assert all(len(c) >= 3 for c in blocks_per_family(plan).values())  # and several dorms in each
