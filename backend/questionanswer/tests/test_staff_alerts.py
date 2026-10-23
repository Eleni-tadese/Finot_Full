"""Counselors are alerted to private questions; staff see what waits for them."""
import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.models import Notification
from questionanswer.models import Answer, PrivateQuestionAssignment, Question, TeacherSpecialization

User = get_user_model()
ASK = "/api/qa/questions/"


def make_user(email, role=None, *specs):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=email.split("@")[0], last_name="T")
    if role:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=role)[0])
    for spec in specs:
        TeacherSpecialization.objects.create(user=user, specialization=spec)
    return User.objects.get(pk=user.pk)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def titles(user):
    return list(Notification.objects.filter(user=user, notification_type=Notification.TYPE_QA).values_list("title", flat=True))


def ask_private(asker, category="Academic", **extra):
    body = {"display_name": "S", "category": category, "question_body": "Help me?", "visibility": "PRIVATE", **extra}
    res = client_for(asker).post(ASK, body, format="json")
    assert res.status_code == 201
    return Question.objects.get(pk=res.json()["id"])


@pytest.mark.django_db
class TestAnonymity:
    def setup_method(self):
        self.asker = make_user("asker@x.test")
        self.academic = make_user("a@x.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)

    def test_the_counselor_sees_only_the_nickname_but_the_super_admin_sees_who_asked(self):
        q = ask_private(self.asker, "Academic", display_name="Night owl")
        assert q.anonymous is True and q.email_on_answer is True  # the defaults
        mine = client_for(self.academic).get(f"{ASK}counselor-queue/").json()
        row = next(r for r in mine if r["id"] == str(q.id))
        assert row["asker_name"] == "Night owl" and row["user"] is None
        boss_row = next(r for r in client_for(self.boss).get(f"{ASK}counselor-queue/").json() if r["id"] == str(q.id))
        assert boss_row["asker_name"].startswith("asker") and boss_row["user"] == self.asker.id

    def test_the_student_may_show_their_name_and_refuse_the_email(self, mailoutbox):
        from notifications.channels.email import EmailChannel

        q = ask_private(self.asker, "Academic", anonymous=False, email_on_answer=False)
        row = next(r for r in client_for(self.academic).get(f"{ASK}counselor-queue/").json() if r["id"] == str(q.id))
        assert row["asker_name"].startswith("asker") and row["user"] == self.asker.id
        before = len(mailoutbox)  # the counselor's own "new question" alert is already there
        EmailChannel().on_question_answered(baker.make(Answer, question=q, is_approved=True))
        assert len(mailoutbox) == before and not any(m.to == ["asker@x.test"] for m in mailoutbox)  # the student said no email


@pytest.mark.django_db
class TestCounselorAlerts:
    def setup_method(self):
        self.asker = make_user("asker@x.test")
        self.academic = make_user("a@x.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        self.spiritual = make_user("s@x.test", Role.QA_COUNSELOR, TeacherSpecialization.SOUL_TEACHER)
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.mod = make_user("m@x.test", Role.QA_MODERATOR)

    def test_only_the_counselor_who_handles_the_category_is_told(self, mailoutbox):
        ask_private(self.asker, "Academic")
        assert titles(self.academic) == ["New private question"]
        assert titles(self.spiritual) == [] and titles(self.boss) == [] and titles(self.mod) == []
        # the same people get an email with a button to their queue
        from notifications.models import EmailOutbox

        rows = EmailOutbox.objects.filter(kind=EmailOutbox.KIND_QA_ALERT)
        assert [r.email for r in rows] == ["a@x.test"] and rows[0].status == EmailOutbox.SENT
        assert [m.to for m in mailoutbox] == [["a@x.test"]] and "dashboard/counselor/queue" in mailoutbox[0].alternatives[0][0]

    def test_a_personal_question_goes_to_the_super_admin_to_assign(self):
        question = ask_private(self.asker, "Personal")
        assert titles(self.academic) == [] and titles(self.spiritual) == []
        assert titles(self.boss) == ["A private question needs a counselor"]
        # assigning it tells that counselor
        client_for(self.boss).post(f"{ASK}{question.id}/assign/", {"counselor_ids": [self.academic.id]}, format="json")
        assert titles(self.academic) == ["A private question was assigned to you"]

    def test_a_category_nobody_handles_also_goes_to_the_super_admin(self):
        ask_private(self.asker, "Family")
        assert titles(self.boss) == ["A private question needs a counselor"]

    def test_the_asker_is_not_alerted_about_their_own_question(self):
        counselor_who_asks = make_user("c@x.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        ask_private(counselor_who_asks, "Academic")
        assert titles(counselor_who_asks) == [] and titles(self.academic) == ["New private question"]


@pytest.mark.django_db
class TestMyWork:
    def setup_method(self):
        self.mod = make_user("m@x.test", Role.QA_MODERATOR)
        self.counselor = make_user("c@x.test", Role.QA_COUNSELOR, TeacherSpecialization.ACADEMIC)
        self.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
        self.student = make_user("s@x.test")
        question = baker.make(Question, visibility="PUBLIC", is_approved=False)
        baker.make(Question, visibility="PUBLIC", is_approved=True)
        baker.make(Answer, question=question, is_approved=False)
        baker.make(Question, visibility="PRIVATE", category="Academic", is_approved=True, user=self.student)
        baker.make(Question, visibility="PRIVATE", category="Personal", is_approved=True, user=self.student)

    def work(self, user):
        return client_for(user).get(f"{ASK}my-work/").json()

    def test_moderator_sees_what_to_approve_only(self):
        data = self.work(self.mod)
        assert data["moderation"] == {"questions": 1, "answers": 1, "unanswered": 0}
        assert data["counselor"] is None and data["admin"] is None

    def test_counselor_sees_their_unanswered_questions_only(self):
        data = self.work(self.counselor)
        assert data["counselor"] == {"unanswered": 1} and data["moderation"] is None and data["admin"] is None

    def test_super_admin_sees_approvals_and_what_needs_a_counselor(self):
        data = self.work(self.boss)
        assert data["moderation"] == {"questions": 1, "answers": 1, "unanswered": 0}
        assert data["admin"] == {"needs_counselor": 1}  # the Personal one; the Academic one has a counselor

    def test_a_plain_student_has_nothing_waiting_and_a_guest_is_refused(self):
        assert self.work(self.student) == {"moderation": None, "counselor": None, "admin": None}
        assert APIClient().get(f"{ASK}my-work/").status_code in (401, 403)
