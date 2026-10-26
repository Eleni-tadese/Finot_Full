"""
Events: a general event (Event Manager) goes to everyone, a group event (Service Admin) only to that group;
attendance is taken by the Event Manager for their general events, by a Service Admin for their group, by the Super Admin for any.
"""
from datetime import datetime, timezone

import pytest
from django.contrib.auth import get_user_model
from model_bakery import baker
from rest_framework.test import APIClient

from core.models import Role, UserRole
from notifications.channels.email import EmailChannel
from notifications.channels.in_app import InAppChannel
from notifications.models import Notification
from service.event_rules import attendance_roster, format_when, notification_audience
from service.models import Event, ServiceAttendance, ServiceGroup, ServiceGroupMembership
from student.models import StudentProfile

User = get_user_model()
EVENTS = "/api/service/events/"
MARK = "/api/service/attendance/mark/"


def make_user(email, role=None, status=StudentProfile.IN_CAMPUS, first="Person"):
    user = User.objects.create_user(username=email, email=email, password="x", first_name=first, last_name="T")
    if role:
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=role)[0])
    StudentProfile.objects.update_or_create(user=user, defaults={"status": status})
    return User.objects.get(pk=user.pk)


def client_for(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


def join(group, student):
    ServiceGroupMembership.objects.create(service_group=group, student=student, status=ServiceGroupMembership.ACTIVE)


def mark(user, event, students, status="PRESENT"):
    body = {"event_id": event.id, "attendances": [{"student_id": s.id, "status": status} for s in students]}
    return client_for(user).post(MARK, body, format="json")


@pytest.fixture
def world():
    class W:
        pass

    w = W()
    w.boss = make_user("boss@x.test", Role.SUPER_ADMIN)
    w.manager = make_user("em@x.test", Role.EVENT_MANAGER)
    w.other_manager = make_user("em2@x.test", Role.EVENT_MANAGER)
    w.sa1 = make_user("sa1@x.test", Role.SERVICE_ADMIN)
    w.sa2 = make_user("sa2@x.test", Role.SERVICE_ADMIN)
    w.g1 = baker.make(ServiceGroup, name="Choir", admin=w.sa1)
    w.g2 = baker.make(ServiceGroup, name="Media", admin=w.sa2)
    w.a = make_user("a@x.test")
    w.b = make_user("b@x.test")
    w.c = make_user("c@x.test")
    w.grad = make_user("grad@x.test", status=StudentProfile.GRADUATED)
    w.gone = make_user("gone@x.test")
    User.objects.filter(pk=w.gone.pk).update(is_active=False)
    join(w.g1, w.a)
    join(w.g1, w.grad)
    join(w.g2, w.b)
    w.general = baker.make(Event, title="Fellowship day", service_group=None, created_by=w.manager,
                           start_date=datetime(2026, 10, 12, 11, 0, tzinfo=timezone.utc), end_date=datetime(2026, 10, 12, 14, 0, tzinfo=timezone.utc))
    w.group_event = baker.make(Event, title="Choir rehearsal", service_group=w.g1, created_by=w.sa1,
                               start_date=datetime(2026, 10, 13, 11, 0, tzinfo=timezone.utc), end_date=datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc))
    return w


@pytest.mark.django_db
class TestWhoMakesWhichEvent:
    body = {"title": "T", "description": "d", "start_date": "2026-10-14T09:00", "end_date": "2026-10-14T10:00"}

    def test_an_event_manager_makes_general_events_only_even_if_a_group_is_sent(self, world):
        ok = client_for(world.manager).post(EVENTS, self.body, format="json")
        assert ok.status_code == 201 and ok.json()["service_group"] is None
        sneaky = client_for(world.manager).post(EVENTS, {**self.body, "service_group": world.g1.id}, format="json")
        assert sneaky.status_code == 403

    def test_a_service_admin_makes_events_for_their_own_group_only(self, world):
        ok = client_for(world.sa1).post(EVENTS, {**self.body, "service_group": world.g1.id}, format="json")
        assert ok.status_code == 201 and ok.json()["service_group"] == world.g1.id
        other = client_for(world.sa1).post(EVENTS, {**self.body, "service_group": world.g2.id}, format="json")
        assert other.status_code == 403
        # without a group in the form, a Service Admin's event still belongs to their group
        assert client_for(world.sa1).post(EVENTS, self.body, format="json").json()["service_group"] == world.g1.id

    def test_a_student_cannot_make_events_and_the_super_admin_can_make_either_kind(self, world):
        assert client_for(world.a).post(EVENTS, self.body, format="json").status_code == 403
        assert client_for(world.boss).post(EVENTS, self.body, format="json").json()["service_group"] is None
        assert client_for(world.boss).post(EVENTS, {**self.body, "service_group": world.g2.id}, format="json").status_code == 201

    def test_an_edit_cannot_move_an_event_into_a_group(self, world):
        res = client_for(world.manager).patch(f"{EVENTS}{world.general.id}/", {"service_group": world.g1.id}, format="json")
        world.general.refresh_from_db()
        assert res.status_code == 200 and world.general.service_group_id is None

    def test_typed_times_are_ethiopian_local_time(self, world):
        res = client_for(world.manager).post(EVENTS, self.body, format="json")
        event = Event.objects.get(pk=res.json()["id"])
        assert event.start_date == datetime(2026, 10, 14, 6, 0, tzinfo=timezone.utc)  # 09:00 in Ethiopia is 06:00 UTC


@pytest.mark.django_db
class TestWhoSeesWhat:
    def ids(self, user):
        data = client_for(user).get(EVENTS).json()
        return {e["id"] for e in (data["results"] if isinstance(data, dict) else data)}

    def test_group_events_stay_in_the_group(self, world):
        assert self.ids(world.a) == {world.general.id, world.group_event.id}  # member of the choir
        assert self.ids(world.b) == {world.general.id}                          # member of another group
        assert self.ids(world.c) == {world.general.id}                          # in no group


@pytest.mark.django_db
class TestCanTakeAttendanceFlag:
    """The event list tells the app which events this person may take attendance for (the phone only shows or hides a button)."""

    def flags(self, user):
        data = client_for(user).get(EVENTS).json()
        return {e["id"]: e["can_take_attendance"] for e in (data["results"] if isinstance(data, dict) else data)}

    def test_flag_follows_the_server_rule(self, world):
        assert self.flags(world.manager)[world.general.id] is True          # their own general event
        assert self.flags(world.other_manager)[world.general.id] is False   # another manager's event
        assert self.flags(world.sa1)[world.group_event.id] is True          # their group's event
        assert self.flags(world.sa1)[world.general.id] is False
        assert self.flags(world.a)[world.group_event.id] is False           # a student
        assert set(self.flags(world.boss).values()) == {True}               # the Super Admin: all


@pytest.mark.django_db
class TestAttendanceRoster:
    def roster(self, user, event):
        return client_for(user).get(f"{EVENTS}{event.id}/roster/")

    def test_general_event_roster_is_every_active_in_campus_student(self, world):
        ids = {p.id for p in attendance_roster(world.general)}
        assert world.a.id in ids and world.b.id in ids and world.c.id in ids
        assert world.grad.id not in ids and world.gone.id not in ids

    def test_group_event_roster_is_the_active_members_only(self, world):
        assert {p.id for p in attendance_roster(world.group_event)} == {world.a.id}  # the graduate member is left out

    def test_the_event_manager_opens_the_roster_of_their_own_event_with_saved_marks(self, world):
        ServiceAttendance.objects.create(event=world.general, student=world.a, status="PRESENT")
        data = self.roster(world.manager, world.general).json()
        by_id = {r["id"]: r for r in data["students"]}
        assert by_id[world.a.id]["status"] == "PRESENT" and by_id[world.b.id]["status"] is None
        assert data["count"] == len(data["students"])
        assert [r["id"] for r in self.roster(world.manager, world.general).json()["students"]]  # sorted list
        assert {r["id"] for r in client_for(world.manager).get(f"{EVENTS}{world.general.id}/roster/", {"search": "b@x"}).json()["students"]} == {world.b.id}

    def test_nobody_else_opens_it(self, world):
        assert self.roster(world.other_manager, world.general).status_code == 403   # another manager's event
        assert self.roster(world.sa1, world.general).status_code == 403             # general events are not a Service Admin's
        assert self.roster(world.sa2, world.group_event).status_code in (403, 404)  # another group's event
        assert self.roster(world.a, world.group_event).status_code == 403           # a plain member
        assert self.roster(world.boss, world.general).status_code == 200            # the Super Admin sees any


@pytest.mark.django_db
class TestMarkingAttendance:
    def test_event_manager_marks_their_general_event(self, world):
        res = mark(world.manager, world.general, [world.a, world.b, world.c])
        assert res.status_code == 200
        assert ServiceAttendance.objects.filter(event=world.general, status="PRESENT").count() == 3
        # changing a mark updates it, it does not duplicate
        mark(world.manager, world.general, [world.a], "ABSENT")
        assert ServiceAttendance.objects.get(event=world.general, student=world.a).status == "ABSENT"
        assert ServiceAttendance.objects.filter(event=world.general).count() == 3

    def test_each_person_may_mark_only_what_is_theirs(self, world):
        assert mark(world.other_manager, world.general, [world.a]).status_code == 403
        assert mark(world.sa1, world.general, [world.a]).status_code == 403
        assert mark(world.sa2, world.group_event, [world.a]).status_code == 403
        assert mark(world.a, world.group_event, [world.a]).status_code == 403
        assert mark(world.sa1, world.group_event, [world.a]).status_code == 200
        assert mark(world.boss, world.general, [world.b]).status_code == 200
        assert mark(world.boss, world.group_event, [world.a]).status_code == 200

    def test_only_people_on_the_list_can_be_marked(self, world):
        res = mark(world.manager, world.general, [world.a, world.grad, world.gone])
        assert res.status_code == 400 and set(res.json()["invalid_student_ids"]) == {world.grad.id, world.gone.id}
        assert not ServiceAttendance.objects.filter(event=world.general).exists()  # nothing was saved
        # a group event can only mark that group's members
        assert mark(world.sa1, world.group_event, [world.b]).status_code == 400

    def test_students_see_their_own_history(self, world):
        mark(world.manager, world.general, [world.a], "ABSENT")
        rows = client_for(world.a).get("/api/service/attendance/").json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        assert [(r["event_title"], r["status"]) for r in rows] == [("Fellowship day", "ABSENT")]
        assert client_for(world.b).get("/api/service/attendance/").json() in ([], {"count": 0, "next": None, "previous": None, "results": []})


@pytest.mark.django_db
class TestAudience:
    """An event may be for some students only: years, gender, departments."""

    def people(self, world):
        from datetime import timedelta

        from django.utils import timezone as tz

        y1f, y1m, y2f = make_user("y1f@x.test"), make_user("y1m@x.test"), make_user("y2f@x.test")
        User.objects.filter(pk__in=[y1f.pk, y2f.pk]).update(gender="F")
        User.objects.filter(pk=y1m.pk).update(gender="M")
        y1f, y1m, y2f = (User.objects.get(pk=u.pk) for u in (y1f, y1m, y2f))  # fresh objects carry the gender
        StudentProfile.objects.filter(user__in=[y1f, y1m]).update(batch_year=1, department="Pre-Engineering")
        StudentProfile.objects.filter(user=y2f).update(batch_year=2, department="Pharmacy")
        start = tz.now() + timedelta(days=1)
        event = baker.make(Event, title="Sisters of year 1", service_group=None, created_by=world.manager,
                           start_date=start, end_date=start + timedelta(hours=2), audience_years=[1], audience_gender="F")
        return y1f, y1m, y2f, event

    def test_roster_audience_and_visibility_follow_the_audience(self, world):
        y1f, y1m, y2f, event = self.people(world)
        assert {u.id for u in attendance_roster(event)} == {y1f.id}
        assert {u.id for u in notification_audience(event)} == {y1f.id}
        def titles(user):  # the list may be paginated
            data = client_for(user).get("/api/service/events/").json()
            return [e["title"] for e in (data["results"] if isinstance(data, dict) else data)]
        assert "Sisters of year 1" in titles(y1f)
        assert "Sisters of year 1" not in titles(y1m) and "Sisters of year 1" not in titles(y2f)
        assert "Sisters of year 1" in titles(world.manager) and "Sisters of year 1" in titles(world.boss)  # staff see every event
        assert "Fellowship day" in titles(y1m)  # an event without audience is for everyone

    def test_departments_and_label_and_validation(self, world):
        from service.event_rules import audience_label

        y1f, y1m, y2f, event = self.people(world)
        event.audience_gender = ""
        event.audience_departments = ["pre-engineering"]  # case does not matter
        event.save()
        assert {u.id for u in attendance_roster(event)} == {y1f.id, y1m.id}
        assert audience_label(event) == "Year 1 · pre-engineering"
        c = client_for(world.manager)
        body = {"title": "T", "description": "d", "start_date": "2027-01-10T09:00", "end_date": "2027-01-10T10:00"}
        assert c.post("/api/service/events/", {**body, "audience_years": [9]}, format="json").status_code == 400
        assert c.post("/api/service/events/", {**body, "audience_departments": [1]}, format="json").status_code == 400
        ok = c.post("/api/service/events/", {**body, "audience_years": ["2", 1], "audience_gender": "M"}, format="json")
        assert ok.status_code == 201 and ok.json()["audience_years"] == [1, 2] and ok.json()["audience_label"] == "Year 1, 2 · Men"


@pytest.mark.django_db
class TestAnnouncingOnce:
    """notifications.handlers.announce_event: once per event, never for an event that is already over."""

    def test_an_event_born_in_the_past_is_announced_when_it_is_moved_to_the_future_and_only_once(self, world):
        from datetime import timedelta

        from django.utils import timezone as tz

        from notifications.handlers import announce_event
        from notifications.models import Notification

        ev = world.general  # fixed past dates: Completed
        assert announce_event(ev.id) is False and ev.announced_at is None
        ev.start_date = tz.now() + timedelta(days=1)
        ev.end_date = ev.start_date + timedelta(hours=2)
        ev.save()
        assert announce_event(ev.id) is True
        ev.refresh_from_db()
        assert ev.announced_at is not None
        told = Notification.objects.filter(notification_type=Notification.TYPE_EVENT).count()
        assert told > 0
        ev.title = "Renamed"
        ev.save()
        assert announce_event(ev.id) is False  # an edit never announces twice
        assert Notification.objects.filter(notification_type=Notification.TYPE_EVENT).count() == told
        assert announce_event(999999) is False


@pytest.mark.django_db
class TestTellingPeopleAboutAnEvent:
    def test_who_is_told(self, world):
        assert {u.id for u in notification_audience(world.group_event)} == {world.a.id, world.grad.id}
        everyone = {u.id for u in notification_audience(world.general)}
        assert {world.a.id, world.b.id, world.c.id, world.boss.id} <= everyone and world.gone.id not in everyone

    def test_the_time_is_shown_in_ethiopian_time(self, world):
        assert format_when(world.general) == "Monday, 12 October 2026, 2:00 PM - 5:00 PM"  # 11:00 UTC is 14:00 in Ethiopia

    def test_in_app_alert_goes_to_the_group_only_and_names_the_local_time(self, world):
        InAppChannel().on_event_published(world.group_event)
        got = Notification.objects.filter(notification_type=Notification.TYPE_EVENT)
        assert {n.user_id for n in got} == {world.a.id, world.grad.id}
        assert "2:00 PM" in got.first().message

    @staticmethod
    def _soon(event):
        """The world's events are on fixed past dates; the outbox skips an event that already started."""
        from datetime import timedelta
        from django.utils import timezone as tz

        event.start_date = tz.now().replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(days=2)  # 2:00 PM Ethiopia
        event.end_date = event.start_date + timedelta(hours=1)
        event.save()

    def test_email_goes_to_the_group_only_with_place_time_and_a_safe_description(self, world, mailoutbox):
        self._soon(world.group_event)
        world.group_event.place_name = "Main hall"
        world.group_event.place_url = "https://maps.example.org/hall"
        world.group_event.description = "Bring your <script>alert(1)</script> notebook\nand water"
        world.group_event.save()
        EmailChannel().on_event_published(world.group_event)
        assert sorted(m.to[0] for m in mailoutbox) == ["a@x.test", "grad@x.test"]
        html = mailoutbox[0].alternatives[0][0]
        assert "Choir rehearsal" in html and "2:00 PM" in html and "Main hall" in html and "maps.example.org/hall" in html
        assert "Choir" in html and "<script>" not in html and "&lt;script&gt;" in html and "<br>" in html

    def test_a_general_event_is_emailed_to_everyone_once(self, world, mailoutbox):
        self._soon(world.general)
        EmailChannel().on_event_published(world.general)
        recipients = [m.to[0] for m in mailoutbox]
        assert len(recipients) == len(set(recipients)) and "c@x.test" in recipients and "gone@x.test" not in recipients

    def test_undeliverable_addresses_are_skipped_and_the_daily_limit_applies(self, world, mailoutbox, settings):
        from notifications.models import EmailConfiguration, EmailOutbox

        self._soon(world.general)
        settings.REMINDER_EMAIL_SKIP_UNDELIVERABLE = True
        EmailChannel().on_event_published(world.general)
        assert mailoutbox == [] and EmailOutbox.objects.count() == 0  # every test address ends in .test
        settings.REMINDER_EMAIL_SKIP_UNDELIVERABLE = False
        config = EmailConfiguration.get()
        config.daily_limit = 2
        config.save()
        EmailChannel().on_event_published(world.general)
        assert len(mailoutbox) == 2  # the rest waits in the outbox for tomorrow's allowance
        assert EmailOutbox.objects.filter(status=EmailOutbox.WAITING).count() == EmailOutbox.objects.count() - 2 > 0


@pytest.mark.django_db
class TestEventAttendanceExport:
    URL = "/api/analytics/export/event-attendance/"

    def rows(self, user, **params):
        from io import BytesIO

        from openpyxl import load_workbook

        res = client_for(user).get(self.URL, params)
        assert res.status_code == 200, res.status_code
        return list(load_workbook(BytesIO(res.content)).active.iter_rows(values_only=True))[1:]

    def test_each_person_exports_only_their_own_events(self, world):
        mark(world.manager, world.general, [world.a, world.b])
        mark(world.sa1, world.group_event, [world.a])
        assert len(self.rows(world.manager)) == 2          # the general event only
        assert len(self.rows(world.sa1)) == 1              # the group event only
        assert len(self.rows(world.boss)) == 3             # everything
        assert client_for(world.other_manager).get(self.URL).status_code == 200
        assert self.rows(world.other_manager) == []        # has no events of their own
        assert client_for(world.a).get(self.URL).status_code == 403


@pytest.mark.django_db
class TestEventStatusFollowsTheDates:
    def test_status_is_worked_out_from_start_and_end(self):
        from datetime import timedelta
        from django.utils import timezone as tz

        now = tz.now()
        assert Event(start_date=now + timedelta(days=1), end_date=now + timedelta(days=2)).current_status == Event.UPCOMING
        assert Event(start_date=now - timedelta(hours=1), end_date=now + timedelta(hours=1)).current_status == Event.ONGOING
        assert Event(start_date=now - timedelta(days=400), end_date=now - timedelta(days=399)).current_status == Event.COMPLETED

    def test_api_reports_it_and_rejects_an_end_before_the_start(self, world):
        past = baker.make(Event, created_by=world.manager, title="Old", description="d",
                          start_date=datetime(2020, 1, 1, 9, tzinfo=timezone.utc), end_date=datetime(2020, 1, 1, 10, tzinfo=timezone.utc), status=Event.UPCOMING)
        rows = client_for(world.manager).get(EVENTS).json()
        rows = rows["results"] if isinstance(rows, dict) else rows
        assert [r["status"] for r in rows if r["id"] == past.id] == ["COMPLETED"]
        bad = {"title": "T", "description": "d", "start_date": "2026-10-14T10:00", "end_date": "2026-10-14T09:00"}
        assert client_for(world.manager).post(EVENTS, bad, format="json").status_code == 400


@pytest.mark.django_db
class TestEditingAnEvent:
    def test_a_service_admin_edits_own_group_event_as_the_form_sends_it(self, world):
        body = {"title": "Renamed", "description": "d", "start_date": "2026-10-14T09:00", "end_date": "2026-10-14T10:00"}
        res = client_for(world.sa1).patch(f"{EVENTS}{world.group_event.id}/", body, format="multipart")
        assert res.status_code == 200, res.content
        world.group_event.refresh_from_db()
        assert world.group_event.title == "Renamed"
        assert world.group_event.service_group_id == world.g1.id
        assert client_for(world.sa2).patch(f"{EVENTS}{world.group_event.id}/", body, format="multipart").status_code in (403, 404)
