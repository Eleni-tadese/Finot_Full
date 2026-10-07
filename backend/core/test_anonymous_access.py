"""
Security net: a visitor who is not signed in must not get a successful answer from any API route,
except the few public ones listed below. Catches a new view that forgot its permission class
(the project default is AllowAny).
"""
import re

import pytest
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver
from django.urls.resolvers import RegexPattern

DUMMY = "00000000-0000-0000-0000-000000000000"
METHODS = ("get", "post", "put", "patch", "delete")

# (method, path) anyone may call without signing in. A path ending in "*" matches everything under it.
PUBLIC = [
    ("*", "health/"), ("*", ""),                                   # plain pages: "the site is up", home
    ("get", "api/public/*"),                                       # landing-page numbers, is sign-up open
    ("get", "api/schema/*"), ("get", "api/docs/*"),                # API documentation (see the security notes)
    ("post", "auth/jwt/*"),                                        # sign-in, refresh, verify
    ("get", "auth/"), ("get", "api/student/"), ("get", "api/service/"), ("get", "api/qa/"), ("get", "api/course/"),
    ("get", "api/donations/"), ("get", "api/notifications/"), ("get", "api/resources/"),   # API index pages
    ("get", "api/qa/questions/"), ("post", "api/qa/questions/"),   # the public question box (public ones only)
    ("get", "api/qa/answers/"),
    ("post", "api/donations/initiate/"), ("post", "api/donations/webhook/"), ("get", "api/donations/verify/*"),
]


def route_paths(patterns=None, prefix=""):
    patterns = get_resolver().url_patterns if patterns is None else patterns
    for p in patterns:
        if isinstance(p, URLResolver):
            sub = p.pattern.regex.pattern if isinstance(p.pattern, RegexPattern) else str(p.pattern)
            yield from route_paths(p.url_patterns, prefix + sub)
        elif isinstance(p, URLPattern):
            sub = p.pattern.regex.pattern if isinstance(p.pattern, RegexPattern) else str(p.pattern)
            yield prefix + sub


def concrete(route):
    if "format" in route:
        return None
    s = re.sub(r"\(\?P<[^>]+>[^)]*\)", DUMMY, route)       # regex groups -> a dummy id
    s = re.sub(r"<[^>:]+:[^>]+>|<[^>]+>", DUMMY, s)           # path converters -> a dummy id
    s = s.replace("^", "").replace("$", "").replace("\\", "").replace("/?", "/")
    return s.lstrip("/")


def allowed(method, path):
    for m, rule in PUBLIC:
        if m not in ("*", method):
            continue
        if path == rule or (rule.endswith("*") and path.startswith(rule[:-1])):
            return True
    return False


@pytest.mark.django_db
def test_anonymous_visitors_get_no_success_from_private_routes():
    client = Client(raise_request_exception=False)
    seen, open_routes = set(), []
    for route in route_paths():
        path = concrete(route)
        if path is None or path in seen or path.startswith("admin/") or path.startswith("static"):
            continue
        seen.add(path)
        for method in METHODS:
            if allowed(method, path):
                continue
            response = getattr(client, method)("/" + path, data="{}" if method != "get" else None,
                                               content_type="application/json") if method != "get" else client.get("/" + path)
            if 200 <= response.status_code < 300:
                open_routes.append(f"{method.upper()} /{path} -> {response.status_code}")
    assert not open_routes, "Open to anonymous visitors:\n" + "\n".join(open_routes)


@pytest.mark.django_db
class TestPublicQuestionBoxLeaks:
    """The public question box is open to everyone, so it must show nothing private."""

    def _setup(self):
        from django.contrib.auth import get_user_model
        from questionanswer.models import Answer, Question

        asker = get_user_model().objects.create_user(
            username="secret.asker@example.com", email="secret.asker@example.com", password="x",
            first_name="Sirak", middle_name="Girma", last_name="Tadesse")
        cat = Question.CATEGORY_CHOICES[0][0]
        shown = Question.objects.create(user=asker, display_name="Nick", category=cat, question_body="Shown?",
                                        visibility=Question.VISIBILITY_PUBLIC, is_approved=True)
        waiting = Question.objects.create(user=asker, display_name="Nick", category=cat, question_body="Waiting?",
                                          visibility=Question.VISIBILITY_PUBLIC, is_approved=False)
        private = Question.objects.create(user=asker, display_name="Nick", category=cat, question_body="Private?",
                                          visibility=Question.VISIBILITY_PRIVATE, is_approved=True)
        ok = Answer.objects.create(question=shown, display_name="Abba", answer_body="Yes", is_approved=True)
        hidden = Answer.objects.create(question=shown, display_name="Abba", answer_body="Draft answer", is_approved=False)
        return shown, waiting, private, ok, hidden

    def test_visitor_sees_only_approved_public_items(self):
        shown, waiting, private, ok, hidden = self._setup()
        c = Client()
        listed = c.get("/api/qa/questions/").content.decode()
        assert "Shown?" in listed and "Waiting?" not in listed and "Private?" not in listed
        assert c.get(f"/api/qa/questions/{waiting.pk}/").status_code == 404
        assert c.get(f"/api/qa/questions/{private.pk}/").status_code == 404
        answers = c.get("/api/qa/answers/").content.decode()
        assert "Yes" in answers and "Draft answer" not in answers
        assert c.get(f"/api/qa/answers/{hidden.pk}/").status_code == 404

    def test_visitor_never_sees_who_really_asked(self):
        self._setup()
        text = Client().get("/api/qa/questions/").content.decode()
        for secret in ("secret.asker", "Sirak", "Girma", "Tadesse"):
            assert secret not in text, secret

    def test_visitor_cannot_change_or_delete(self):
        shown, *_ = self._setup()
        c = Client()
        assert c.delete(f"/api/qa/questions/{shown.pk}/").status_code in (401, 403)
        assert c.patch(f"/api/qa/questions/{shown.pk}/", data='{"question_body":"x"}', content_type="application/json").status_code in (401, 403)


@pytest.mark.django_db
def test_a_plain_student_cannot_read_another_students_private_details():
    """Student A calls every list page and a few detail pages; student B's private details must never appear."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient
    from student.models import StudentProfile

    User = get_user_model()
    a = User.objects.create_user(username="a.snoop@example.com", email="a.snoop@example.com", password="x",
                                 first_name="Snoop", middle_name="A", last_name="A")
    b = User.objects.create_user(username="b.victim@example.com", email="b.victim@example.com", password="x",
                                 first_name="Victim", middle_name="B", last_name="B")
    StudentProfile.objects.filter(user=a).update(batch_year=1)
    StudentProfile.objects.filter(user=b).update(
        batch_year=1, personal_phone="0977123456", emergency_name="Zebiba Emergency", emergency_phone="0966123456",
        home_address="Secret Street 99", confession_father="Abba Secret", telegram_username="victim_tg")
    markers = ["b.victim@example.com", "0977123456", "Zebiba Emergency", "0966123456", "Secret Street 99", "Abba Secret", "victim_tg"]

    client = APIClient(raise_request_exception=False)
    client.force_authenticate(a)
    paths = {"/auth/users/", f"/auth/users/{b.pk}/", f"/api/student/profiles/{b.student_profile.pk}/", "/api/student/profiles/"}
    for route in route_paths():
        path = concrete(route)
        if path and path.startswith(("api/", "auth/")) and DUMMY not in path and "export" not in path and "cron" not in path:
            paths.add("/" + path)
    leaks = []
    for path in sorted(paths):
        response = client.get(path)
        body = response.content.decode("utf-8", "ignore")
        found = [m for m in markers if m in body]
        if found and response.status_code == 200:
            leaks.append(f"{path}: {found}")
    assert not leaks, "A plain student can read another student's details:\n" + "\n".join(leaks)


@pytest.mark.django_db
class TestUserLookupIsClosed:
    """Djoser's /auth/users/<id>/ used to answer anybody, so accounts could be listed by counting ids."""

    def _people(self):
        from django.contrib.auth import get_user_model
        from core.models import Role, UserRole

        User = get_user_model()
        a = User.objects.create_user(username="a@example.com", email="a@example.com", password="x", first_name="A")
        b = User.objects.create_user(username="b@example.com", email="b@example.com", password="x", first_name="B")
        boss = User.objects.create_user(username="boss@example.com", email="boss@example.com", password="x", first_name="Boss")
        UserRole.objects.create(user=boss, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        return a, b, boss

    def test_visitor_gets_nothing(self):
        a, b, _ = self._people()
        c = Client(raise_request_exception=False)
        assert c.get(f"/auth/users/{b.pk}/").status_code in (401, 403)
        assert c.get("/auth/users/").status_code in (401, 403)
        assert c.get("/auth/users/me/").status_code in (401, 403)
        assert c.patch(f"/auth/users/{b.pk}/", data='{"first_name":"X"}', content_type="application/json").status_code in (401, 403)

    def test_student_reads_only_self(self):
        from rest_framework.test import APIClient

        a, b, _ = self._people()
        c = APIClient()
        c.force_authenticate(a)
        assert c.get(f"/auth/users/{a.pk}/").status_code == 200
        assert c.get("/auth/users/me/").status_code == 200
        assert c.get(f"/auth/users/{b.pk}/").status_code == 404 or c.get(f"/auth/users/{b.pk}/").status_code == 403
        assert "b@example.com" not in c.get("/auth/users/").content.decode()

    def test_super_admin_can_read_any(self):
        from rest_framework.test import APIClient

        a, b, boss = self._people()
        c = APIClient()
        c.force_authenticate(boss)
        assert c.get(f"/auth/users/{b.pk}/").status_code == 200


@pytest.mark.django_db
class TestWebhookAndCronGuards:
    def test_chapa_webhook_refuses_to_work_without_a_secret(self, monkeypatch):
        import hashlib
        import hmac

        import donation.views as views
        monkeypatch.setattr(views, "config", lambda key, default="": "")
        body = b'{"event":"charge.success","tx_ref":"abc"}'
        forged = hmac.new(b"", body, hashlib.sha256).hexdigest()   # what anyone could compute with an empty secret
        res = Client().post("/api/donations/webhook/", data=body, content_type="application/json", HTTP_X_CHAPA_SIGNATURE=forged)
        assert res.status_code == 503

    def test_cron_token_with_odd_characters_is_just_refused(self, settings):
        settings.CRON_SECRET = "real-secret"
        res = Client().post("/api/notifications/cron/weekly-reminders/", HTTP_X_CRON_TOKEN="wrong-é")
        assert res.status_code == 404


@pytest.mark.django_db
class TestBackendFrontDoor:
    def test_root_sends_visitors_to_the_website(self, settings):
        settings.FRONTEND_URL = "https://finot.example.org"
        res = Client().get("/")
        assert res.status_code == 302 and res["Location"] == "https://finot.example.org"

    def test_root_without_a_site_address_says_the_api_runs(self, settings):
        settings.FRONTEND_URL = ""
        res = Client().get("/")
        assert res.status_code == 200 and res.json()["service"] == "Finot API"
