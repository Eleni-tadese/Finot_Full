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
