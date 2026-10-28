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

    def test_leftovers_are_counted_the_way_the_placement_deals(self):
        # 10 families take at most 2 women each (20): of 30 women, 10 are left; men fit (80 places for 70)
        o = ratio_outcome(30, 70, 10, 2, 8)
        assert o["left_female"] == 10 and o["left_male"] == 0 and o["left_total"] == 10 and o["families_full"] == 8

    def test_the_estimate_matches_what_the_placement_really_leaves(self):
        from service.distribution import FamilyInfo, StudentInfo
        from service.distribution_rules import plan_by_ratio

        women = [StudentInfo(id=i, name=f"W{i}", gender="F") for i in range(57)]
        men = [StudentInfo(id=100 + i, name=f"M{i}", gender="M") for i in range(125)]
        families = [FamilyInfo(i, f"F{i}") for i in range(1, 22)]
        for f, m in ((3, 7), (2, 8), (4, 6)):
            guess = ratio_outcome(57, 125, 21, f, m)["left_total"]
            real = len(plan_by_ratio(women + men, families, 10, f, m).unplaced)
            assert guess == real, (f, m, guess, real)

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


from service.distribution_rules import normalise_priority, place_remaining  # noqa: E402


class TestPriorityAndRemaining:
    def crossed(self):
        # 2 sections x 2 dorm blocks, each section and each dorm has 2 women and 2 men
        rows = []
        for i, (sec, block, g) in enumerate([
            (1, 1, "F"), (1, 1, "M"), (1, 2, "F"), (1, 2, "M"), (2, 1, "F"), (2, 1, "M"), (2, 2, "F"), (2, 2, "M"),
        ]):
            rows.append(StudentInfo(id=i, name=f"S{i}", gender=g, section=sec, dorm_block=block))
        return rows

    def test_the_priority_decides_which_factor_wins_when_both_want_to_stay_together(self):
        fams = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        by_section = plan_by_ratio(self.crossed(), fams, 4, 2, 2, section_mode="together", dorm_mode="together", priority=["section", "dorm"])
        assert all(len(c) == 1 for c in sections_per_family(by_section).values())
        by_dorm = plan_by_ratio(self.crossed(), fams, 4, 2, 2, section_mode="together", dorm_mode="together", priority=["dorm", "section"])
        assert all(len(c) == 1 for c in blocks_per_family(by_dorm).values())

    def test_priority_is_checked_and_completed(self):
        assert normalise_priority(["dorm"]) == ["dorm", "section", "gender"]
        assert normalise_priority(None) == ["section", "dorm", "gender"]
        with pytest.raises(ValueError):
            normalise_priority(["colour"])

    def test_the_remaining_students_fill_the_families_that_have_room(self):
        fams = [FamilyInfo(i, f"Family {i}") for i in range(1, 11)]
        first = plan_by_ratio(people(33, 67), fams, 10, 3, 7)
        assert len(first.unplaced) == 3  # 3 women did not fit the 3:7 ratio
        final = place_remaining(first, fams, 10)
        assert not final.unplaced
        assert all(len(m) == 10 for m in final.assignments.values())  # every family is full: the 3 short ones got a woman
        assert sorted(makeup(final, f.id)[0] for f in fams) == [3] * 7 + [4] * 3

    def test_students_with_no_room_anywhere_stay_remaining(self):
        fams = [FamilyInfo(1, "A")]
        first = plan_by_ratio(people(6, 6), fams, 10, 5, 5)
        final = place_remaining(first, fams, 10)
        assert len(final.assignments[1]) == 10 and len(final.unplaced) == 2
        assert all(reason == "all families are full" for _, reason in final.unplaced)

    def test_remaining_students_respect_the_section_rule_too(self):
        from collections import Counter

        from service.distribution import Plan

        def where(mode):
            fams = [FamilyInfo(1, "A", current_size=3, sections=Counter({2: 3})), FamilyInfo(2, "B")]
            leftover = Plan(assignments={1: [], 2: []}, unplaced=[(StudentInfo(id=9, name="c", gender="F", section=2), "x")])
            final = place_remaining(leftover, fams, 10, section_mode=mode)
            return [fid for fid, m in final.assignments.items() if m][0]

        assert where("together") == 1  # joins the family that already has section 2
        assert where("mix") == 2  # goes where section 2 is not yet


class TestDormRooms:
    """The dorm is block + room number: roommates are told apart even when they share a block."""

    def students(self):
        # one block, 4 rooms of 2: rooms 1 and 2 hold women, rooms 3 and 4 hold men
        rows = []
        for room, gender in ((1, "F"), (2, "F"), (3, "M"), (4, "M")):
            for k in range(2):
                rows.append(StudentInfo(id=room * 10 + k, name=f"{gender}{room}{k}", gender=gender, dorm_block=1, dorm_room=room))
        return rows

    def per_family_rooms(self, plan):
        from collections import Counter

        return [Counter(s.dorm_room for s in members) for members in plan.assignments.values()]

    def test_mix_by_room_puts_roommates_in_different_families(self):
        fams = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        plan = plan_by_ratio(self.students(), fams, 4, 2, 2, dorm_mode="mix", dorm_level="room")
        assert all(makeup(plan, f.id) == (2, 2) for f in fams)
        assert all(max(c.values()) == 1 for c in self.per_family_rooms(plan))  # no two roommates in one family

    def test_together_by_room_keeps_roommates_in_one_family(self):
        fams = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        plan = plan_by_ratio(self.students(), fams, 4, 2, 2, dorm_mode="together", dorm_level="room")
        assert all(set(c.values()) == {2} for c in self.per_family_rooms(plan))  # every room stays whole

    def test_a_student_without_a_room_is_not_held_back_at_room_level(self):
        fams = [FamilyInfo(1, "A"), FamilyInfo(2, "B")]
        lone = [StudentInfo(id=1, name="a", gender="F", dorm_block=5), StudentInfo(id=2, name="b", gender="M", dorm_block=5)]
        plan = plan_by_ratio(lone, fams, 2, 1, 1, dorm_mode="together", dorm_level="room")
        assert not plan.unplaced
