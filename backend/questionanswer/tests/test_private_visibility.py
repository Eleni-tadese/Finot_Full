"""
Private Q&A routing: specialization visibility, admin assignment, moderator exclusion.
"""
import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from questionanswer.models import Answer, PrivateQuestionAssignment, Question, TeacherSpecialization

User = get_user_model()
QUEUE = "/api/qa/questions/counselor-queue/"


def make_user(email, role_name=None, *specializations):
    user = User.objects.create_user(
        username=email, email=email, password="Pass@12345", first_name=email.split("@")[0], last_name="T"
    )
    if role_name:
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.create(user=user, role=role)
    for spec in specializations:
        TeacherSpecialization.objects.create(user=user, specialization=spec)
    return user


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def private_q(category, asker=None):
    return baker.make(
        Question, visibility=Question.VISIBILITY_PRIVATE, category=category, is_approved=True,
        user=asker or make_user(f"asker{Question.objects.count()}@finot.test"),
    )


def queue_ids(user):
    data = client_for(user).get(QUEUE).json()
    rows = data["results"] if isinstance(data, dict) else data
    return {r["id"] for r in rows}


@pytest.mark.django_db
class TestSpecializationRouting:
    def setup_method(self):
        self.academic = private_q(Question.CAT_ACADEMIC)
        self.spiritual = private_q(Question.CAT_SPIRITUAL)
        self.personal = private_q(Question.CAT_PERSONAL)  # psychotherapist: sensitive
        self.family = private_q(Question.CAT_FAMILY)
        self.other = private_q(Question.OTHER)

    def ids(self, *questions):
        return {str(q.id) for q in questions}

    def test_each_counselor_sees_only_the_category_they_handle(self):
        cases = [
            (TeacherSpecialization.ACADEMIC, self.academic),
            (TeacherSpecialization.SOUL_TEACHER, self.spiritual),
            (TeacherSpecialization.FAMILY, self.family),
            (TeacherSpecialization.OTHER, self.other),
        ]
        for i, (spec, question) in enumerate(cases):
            c = make_user(f"c{i}@finot.test", Role.QA_COUNSELOR, spec)
            assert queue_ids(c) == self.ids(question), spec

    def test_psychotherapist_does_not_see_personal_until_assigned(self):
        c = make_user("p@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.PSYCHOTHERAPIST)
        assert queue_ids(c) == set()
        PrivateQuestionAssignment.objects.create(question=self.personal, counselor=c)
        assert queue_ids(c) == self.ids(self.personal)

    def test_counselor_without_specialization_sees_nothing_until_assigned(self):
        c = make_user("n@finot.test", Role.QA_COUNSELOR)
        assert queue_ids(c) == set()
        PrivateQuestionAssignment.objects.create(question=self.family, counselor=c)
        assert queue_ids(c) == self.ids(self.family)

    def test_one_counselor_can_handle_several_categories(self):
        c = make_user("m@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC, TeacherSpecialization.FAMILY)
        assert queue_ids(c) == self.ids(self.academic, self.family)

    def test_assignment_hides_question_from_other_counselors(self):
        a = make_user("a@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        b = make_user("b@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        PrivateQuestionAssignment.objects.create(question=self.academic, counselor=a)
        assert str(self.academic.id) in queue_ids(a)
        assert str(self.academic.id) not in queue_ids(b)

    def test_super_admin_sees_everything(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        assert queue_ids(boss) == self.ids(self.academic, self.spiritual, self.personal, self.family, self.other)

    def test_queue_flags_what_nobody_can_see(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        make_user("a@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)

        def rows():
            data = client_for(boss).get(QUEUE).json()
            return {r["id"]: r for r in (data["results"] if isinstance(data, dict) else data)}

        found = rows()
        # sensitive: always needs an admin, even when a psychotherapist exists
        assert found[str(self.personal.id)]["needs_assignment"] is True
        assert found[str(self.personal.id)]["specialization"] == TeacherSpecialization.PSYCHOTHERAPIST
        # handled by an academic counselor: fine. Nobody handles Spiritual: needs an admin.
        assert found[str(self.academic.id)]["needs_assignment"] is False
        assert found[str(self.spiritual.id)]["needs_assignment"] is True
        assert found[str(self.family.id)]["specialization"] == TeacherSpecialization.FAMILY
        assert found[str(self.other.id)]["specialization"] == TeacherSpecialization.OTHER


@pytest.mark.django_db
class TestPrivateQuestionLeaks:
    def setup_method(self):
        self.personal = private_q(Question.CAT_PERSONAL)
        self.academic = private_q(Question.CAT_ACADEMIC)

    def test_moderator_cannot_open_private_question_or_queue(self):
        mod = make_user("mod@finot.test", Role.QA_MODERATOR)
        client = client_for(mod)
        assert client.get(f"/api/qa/questions/{self.academic.id}/").status_code == 404
        assert client.get(QUEUE).status_code == 403

    def test_unrouted_counselor_cannot_open_by_id(self):
        c = make_user("a@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        client = client_for(c)
        assert client.get(f"/api/qa/questions/{self.personal.id}/").status_code == 404
        assert client.get(f"/api/qa/questions/{self.academic.id}/").status_code == 200

    def test_unrouted_counselor_cannot_answer(self):
        c = make_user("a@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        res = client_for(c).post(
            "/api/qa/answers/", {"question": str(self.personal.id), "display_name": "x", "answer_body": "hi"}, format="json"
        )
        assert res.status_code == 403
        assert Answer.objects.count() == 0

    def test_routed_counselor_can_answer(self):
        c = make_user("a@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        res = client_for(c).post(
            "/api/qa/answers/", {"question": str(self.academic.id), "display_name": "Fr", "answer_body": "hi"}, format="json"
        )
        assert res.status_code == 201

    def test_private_answers_not_readable_by_unrelated_users(self):
        answer = baker.make(Answer, question=self.personal, is_approved=True)
        other = make_user("stu@finot.test")
        mod = make_user("mod@finot.test", Role.QA_MODERATOR)
        for user in (other, mod):
            assert client_for(user).get(f"/api/qa/answers/{answer.id}/").status_code == 404

    def test_asker_still_reads_own_private_question(self):
        asker = self.personal.user
        assert client_for(asker).get(f"/api/qa/questions/{self.personal.id}/").status_code == 200
        assert client_for(asker).get("/api/qa/questions/private-inbox/").status_code == 200


@pytest.mark.django_db
class TestAssignEndpoint:
    def setup_method(self):
        self.q = private_q(Question.CAT_PERSONAL)
        self.counselor = make_user("p@finot.test", Role.QA_COUNSELOR, TeacherSpecialization.PSYCHOTHERAPIST)
        self.url = f"/api/qa/questions/{self.q.id}/assign/"

    def test_super_admin_assigns_and_counselor_gains_access(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        res = client_for(boss).post(self.url, {"counselor_ids": [self.counselor.id]}, format="json")
        assert res.status_code == 200
        assert res.json()["assigned_to"][0]["id"] == self.counselor.id
        assert str(self.q.id) in queue_ids(self.counselor)
        # clearing removes access again
        client_for(boss).post(self.url, {"counselor_ids": []}, format="json")
        assert str(self.q.id) not in queue_ids(self.counselor)

    def test_only_super_admin_can_assign(self):
        for user in (self.counselor, make_user("sa@finot.test", Role.SERVICE_ADMIN), make_user("mod@finot.test", Role.QA_MODERATOR)):
            res = client_for(user).post(self.url, {"counselor_ids": [self.counselor.id]}, format="json")
            assert res.status_code in (403, 404)
        assert PrivateQuestionAssignment.objects.count() == 0

    def test_rejects_non_counselor_ids(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        student = make_user("stu@finot.test")
        res = client_for(boss).post(self.url, {"counselor_ids": [student.id]}, format="json")
        assert res.status_code == 400

    def test_rejects_public_question(self):
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        public = baker.make(Question, visibility=Question.VISIBILITY_PUBLIC, is_approved=True)
        res = client_for(boss).post(f"/api/qa/questions/{public.id}/assign/", {"counselor_ids": []}, format="json")
        assert res.status_code == 400


@pytest.mark.django_db
class TestPrivateQAExport:
    def test_super_admin_only(self):
        from io import BytesIO
        from openpyxl import load_workbook
        q = private_q(Question.CAT_ACADEMIC)
        baker.make(Answer, question=q, answer_body="Peace", is_approved=True)
        boss = make_user("boss@finot.test", Role.SUPER_ADMIN)
        res = client_for(boss).get("/api/analytics/export/private-qa/")
        assert res.status_code == 200
        rows = list(load_workbook(BytesIO(res.content)).active.iter_rows(values_only=True))
        assert rows[1][6] == "Yes" and rows[1][8] == "Peace"
        for user in (make_user("c@finot.test", Role.QA_COUNSELOR), make_user("sa@finot.test", Role.SERVICE_ADMIN)):
            assert client_for(user).get("/api/analytics/export/private-qa/").status_code == 403
