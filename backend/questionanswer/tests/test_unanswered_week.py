"""A public question nobody answered for a week is flagged for the moderators, who can answer it themselves."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.models import Notification
from questionanswer.models import Answer, Question

User = get_user_model()
Q = "/api/qa/questions/"


def make_user(email, role=None):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=role)[0])
    return User.objects.get(pk=user.pk)


def client_for(user=None):
    client = APIClient()
    if user:
        client.force_authenticate(user)
    return client


def aged(days, **kw):
    q = baker.make(Question, visibility="PUBLIC", is_approved=True, category="Academic", question_body=f"Q{days}?", **kw)
    Question.objects.filter(pk=q.pk).update(created_at=timezone.now() - timedelta(days=days))
    return q


@pytest.mark.django_db
class TestUnansweredWeek:
    def setup_method(self):
        self.mod = make_user("m@x.test", Role.QA_MODERATOR)
        self.student = make_user("s@x.test")
        self.old = aged(10)
        self.fresh = aged(3)
        self.answered_old = aged(12)
        baker.make(Answer, question=self.answered_old, is_approved=True)
        self.only_pending_answer = aged(9)
        baker.make(Answer, question=self.only_pending_answer, is_approved=False)

    def listed(self, user):
        return {r["id"]: r for r in client_for(user).get(Q + "unanswered/").json()}

    def test_only_old_questions_without_an_approved_answer_are_listed_oldest_first(self):
        rows = client_for(self.mod).get(Q + "unanswered/").json()
        ids = [r["id"] for r in rows]
        assert set(ids) == {str(self.old.id), str(self.only_pending_answer.id)}
        assert ids[0] == str(self.old.id)  # 10 days old before 9 days old
        by_id = {r["id"]: r for r in rows}
        assert by_id[str(self.old.id)]["days_waiting"] == 10
        assert by_id[str(self.only_pending_answer.id)]["pending_answers"] == 1

    def test_private_and_unapproved_questions_are_not_listed(self):
        q = baker.make(Question, visibility="PRIVATE", is_approved=True)
        r = baker.make(Question, visibility="PUBLIC", is_approved=False)
        Question.objects.filter(pk__in=[q.pk, r.pk]).update(created_at=timezone.now() - timedelta(days=30))
        assert str(q.id) not in self.listed(self.mod) and str(r.id) not in self.listed(self.mod)

    def test_only_moderators_can_see_the_list(self):
        assert client_for(self.student).get(Q + "unanswered/").status_code == 403
        assert client_for().get(Q + "unanswered/").status_code in (401, 403)

    def test_a_moderator_answer_is_published_at_once_and_clears_the_question(self):
        before = Notification.objects.filter(user=self.mod, title="New answer to approve").count()
        body = {"question": str(self.old.id), "display_name": "Mod", "answer_body": "Here is the answer."}
        res = client_for(self.mod).post("/api/qa/answers/", body, format="json")
        assert res.status_code == 201 and Answer.objects.get(pk=res.json()["id"]).is_approved is True
        assert str(self.old.id) not in self.listed(self.mod)
        # and nobody is asked to approve it
        assert Notification.objects.filter(user=self.mod, title="New answer to approve").count() == before

    def test_a_students_answer_still_waits_for_approval(self):
        body = {"question": str(self.old.id), "display_name": "S", "answer_body": "My idea."}
        res = client_for(self.student).post("/api/qa/answers/", body, format="json")
        assert res.status_code == 201 and Answer.objects.get(pk=res.json()["id"]).is_approved is False
        assert str(self.old.id) in self.listed(self.mod)  # still unanswered until approved

    def test_sign_in_summary_counts_them(self):
        assert client_for(self.mod).get(Q + "my-work/").json()["moderation"]["unanswered"] == 2
