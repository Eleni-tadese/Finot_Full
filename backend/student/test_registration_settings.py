import pytest

from student.models import MAX_STUDY_YEAR, RegistrationSettings


@pytest.mark.django_db
class TestRegistrationSettings:
    def test_year_choice_starts_open_and_is_one_row(self):
        assert RegistrationSettings.get().allow_year_choice is True
        row = RegistrationSettings.get()
        row.allow_year_choice = False
        row.save()
        assert RegistrationSettings.objects.count() == 1
        assert RegistrationSettings.get().allow_year_choice is False

    def test_the_longest_year_is_5(self):
        assert MAX_STUDY_YEAR == 5


@pytest.mark.django_db
class TestRegistrationSettingsEndpoint:
    def test_only_the_super_admin_can_read_and_switch_it(self):
        from analytics.test_console import BASE, client_for, make_user
        from core.models import Role

        boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        other = make_user("fam@x.test", Role.FAMILY_ADMIN)
        assert client_for(other).get(BASE + "registration/settings/").status_code == 403
        c = client_for(boss)
        assert c.get(BASE + "registration/settings/").json() == {"allow_year_choice": True, "max_year": 5}
        assert c.patch(BASE + "registration/settings/", {"allow_year_choice": "no"}, format="json").status_code == 400
        res = c.patch(BASE + "registration/settings/", {"allow_year_choice": False}, format="json")
        assert res.status_code == 200 and res.json()["allow_year_choice"] is False
        assert RegistrationSettings.get().allow_year_choice is False


@pytest.mark.django_db
class TestSlipHolderChoosesYear:
    URL = "/api/student/profiles/me/"

    def slip_student(self, email="slip@x.test"):
        from analytics.test_console import make_user
        from student.models import AccountImportBatch, StudentProfile

        user = make_user(email, batch=1)
        batch = AccountImportBatch.objects.create(created_by=None, grace_days=21)
        StudentProfile.objects.filter(user=user).update(batch_year=1, import_batch=batch)
        return user

    def test_a_slip_holder_chooses_the_year_once(self):
        from analytics.test_console import client_for
        from student.models import StudentProfile

        me = client_for(self.slip_student())
        assert me.get(self.URL).json()["can_choose_year"] is True
        # an ordinary save with the same year does not use up the choice
        assert me.patch(self.URL, {"batch_year": 1, "personal_phone": "0911223344"}, format="json").status_code == 200
        assert me.get(self.URL).json()["can_choose_year"] is True
        res = me.patch(self.URL, {"batch_year": 3}, format="json")
        assert res.status_code == 200 and StudentProfile.objects.get(user__email="slip@x.test").batch_year == 3
        assert me.get(self.URL).json()["can_choose_year"] is False
        again = me.patch(self.URL, {"batch_year": 4}, format="json")
        assert again.status_code == 400 and "locked" in str(again.json())

    def test_confirming_the_same_year_uses_up_the_choice(self):
        from analytics.test_console import client_for

        me = client_for(self.slip_student())
        assert me.patch(self.URL, {"batch_year": 1, "year_confirmed": True}, format="json").status_code == 200
        assert me.get(self.URL).json()["can_choose_year"] is False
        assert me.patch(self.URL, {"batch_year": 2}, format="json").status_code == 400

    def test_when_the_switch_is_closed_nobody_chooses(self):
        from analytics.test_console import client_for

        row = RegistrationSettings.get()
        row.allow_year_choice = False
        row.save()
        me = client_for(self.slip_student())
        assert me.get(self.URL).json()["can_choose_year"] is False
        assert me.patch(self.URL, {"batch_year": 3}, format="json").status_code == 400

    def test_year_5_is_the_most_and_a_normal_account_cannot_choose(self):
        from analytics.test_console import client_for, make_user

        me = client_for(self.slip_student("slip2@x.test"))
        assert me.patch(self.URL, {"batch_year": 6}, format="json").status_code == 400
        assert me.patch(self.URL, {"batch_year": 5}, format="json").status_code == 200
        normal = client_for(make_user("normal@x.test", batch=2))
        assert normal.get(self.URL).json()["can_choose_year"] is False
        assert normal.patch(self.URL, {"batch_year": 3}, format="json").status_code == 400


@pytest.mark.django_db
class TestChoosingTheYearEnrolsInCourses:
    def test_the_courses_of_the_chosen_year_open_and_the_old_ones_go(self):
        from analytics.test_console import client_for
        from course.models import Course, CourseEnrollment, SemesterCourse

        slip = TestSlipHolderChoosesYear().slip_student("enrol@x.test")
        first = SemesterCourse.objects.create(course=Course.objects.create(title="Year 1 course", batch_year=1), academic_year=2026, semester=1, status="OPEN")
        third = SemesterCourse.objects.create(course=Course.objects.create(title="Year 3 course", batch_year=3), academic_year=2026, semester=1, status="OPEN")
        CourseEnrollment.objects.get_or_create(semester_course=first, student=slip)
        res = client_for(slip).patch("/api/student/profiles/me/", {"batch_year": 3}, format="json")
        assert res.status_code == 200
        assert CourseEnrollment.objects.filter(student=slip, semester_course=third).exists()
        assert not CourseEnrollment.objects.filter(student=slip, semester_course=first).exists()
