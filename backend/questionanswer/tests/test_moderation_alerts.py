"""Moderators are told, and can see, what waits for approval."""
import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.models import Notification
from questionanswer.models import Answer, Question

User = get_user_model()


def make_user(email, role_name=None):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role_name:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=role_name)[0])
    return User.objects.get(pk=user.pk)


def client_for(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


def qa_notes(user):
    return list(Notification.objects.filter(user=user, notification_type=Notification.TYPE_QA).values_list("title", flat=True))


@pytest.mark.django_db
class TestModerationAlerts:
    def setup_method(self):
        self.mod1 = make_user("m1@x.test", Role.QA_MODERATOR)
        self.mod2 = make_user("m2@x.test", Role.QA_MODERATOR)
        self.student = make_user("s@x.test")
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)

    def ask(self, **extra):
        body = {"display_name": "try", "category": "Academic", "question_body": "How do I study?", "visibility": "PUBLIC", **extra}
        return client_for().post("/api/qa/questions/", body, format="json")

    def test_a_new_public_question_alerts_every_moderator_but_not_others(self):
        assert self.ask().status_code == 201
        assert qa_notes(self.mod1) == ["New question to approve"] and qa_notes(self.mod2) == ["New question to approve"]
        assert qa_notes(self.student) == [] and qa_notes(self.boss) == []

    def test_a_private_question_does_not_alert_the_moderators(self):
        body = {"display_name": "S", "category": "Academic", "question_body": "Private?", "visibility": "PRIVATE"}
        assert client_for(self.student).post("/api/qa/questions/", body, format="json").status_code == 201
        assert qa_notes(self.mod1) == []
        # a visitor with no account cannot ask a private question at all (no inbox to answer into)
        assert client_for().post("/api/qa/questions/", body, format="json").status_code == 400

    def test_a_new_answer_alerts_the_moderators_and_shows_in_the_pending_list(self):
        question = baker.make(Question, visibility="PUBLIC", is_approved=True, category="Academic", question_body="Q?")
        res = client_for(self.student).post("/api/qa/answers/", {"question": str(question.id), "display_name": "S", "answer_body": "Plan ahead."}, format="json")
        assert res.status_code == 201
        assert qa_notes(self.mod1) == ["New answer to approve"]
        rows = client_for(self.mod1).get("/api/qa/answers/pending/").json()
        assert [r["answer_body"] for r in rows] == ["Plan ahead."] and rows[0]["question_body"] == "Q?"
        # approving removes it from the list and shows it publicly
        assert client_for(self.mod1).post(f"/api/qa/answers/{rows[0]['id']}/approve/").status_code == 200
        assert client_for(self.mod1).get("/api/qa/answers/pending/").json() == []

    def test_only_moderators_see_the_pending_answers(self):
        assert client_for(self.student).get("/api/qa/answers/pending/").status_code == 403
        assert client_for().get("/api/qa/answers/pending/").status_code in (401, 403)

    def test_without_moderators_the_super_admin_is_told(self):
        UserRole.objects.filter(role__name=Role.QA_MODERATOR).delete()
        self.ask()
        assert qa_notes(self.boss) == ["New question to approve"]

    def test_a_private_answer_is_not_a_moderation_matter(self):
        question = baker.make(Question, visibility="PRIVATE", is_approved=True, category="Academic")
        baker.make(Answer, question=question, is_approved=True)
        assert qa_notes(self.mod1) == []
