"""
/api/attendance/ endpoints. Every rule lives in rules.py; this file only reads the request and writes the answer.

Organizer (may take attendance for the target):
    POST sessions/open/            {"event_id": 1} or {"course_session_id": "<uuid>"}
    GET  sessions/current/?event_id=1  (or ?course_session_id=)   -> the open session or 404
    GET  sessions/<id>/            counts and state
    POST sessions/<id>/close/      everyone else becomes Absent
    POST sessions/<id>/reopen/
    POST sessions/<id>/helpers/    {"user_ids": [..]}  replaces the helper list
Scanner (organizer or helper):
    GET  sessions/<id>/code/       {"code": "123456", "seconds_left": 17, "qr": "FS1.<id>.123456"}
    POST sessions/<id>/scan/       {"badge": "FB1...", "scanned_at": "<iso, optional>"}
    POST sessions/<id>/sync/       {"scans": [{"badge": ..., "scanned_at": ...}, ...]}  (offline queue, safe to repeat)
Student:
    GET  badge/me/                 {"badge": "FB1...", "name": ..., "version": 1}
    POST sessions/<id>/self-check-in/  {"code": "123456"}
    GET  sessions/open-for-me/     open sessions where the student is on the roster (to find the session id)
"""
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from course.models import CourseSession
from service.event_rules import person_name
from service.models import Event
from student.models import StudentProfile

from . import codes, rules
from .models import AttendanceSession, CheckIn

User = get_user_model()


class SelfCheckInThrottle(UserRateThrottle):
    """10 code attempts a minute per student: enough for typos, too slow to guess 6 digits."""

    scope = "self_check_in"

    def get_rate(self):
        return "10/minute"


# ---- helpers ----------------------------------------------------------------------------------------------

def _error(exc):
    return Response({"code": exc.code, "detail": exc.message}, status=exc.status)


def _student_card(user):
    profile = getattr(user, "student_profile", None)
    photo = getattr(getattr(profile, "profile_image", None), "url", None) if profile and profile.profile_image else None
    return {
        "id": user.id, "name": person_name(user), "photo": photo,
        "batch_year": getattr(profile, "batch_year", None), "department": getattr(profile, "department", None),
    }


def _session_json(session):
    target = session.target
    data = {
        "id": session.id, "kind": session.kind, "status": session.status,
        "opened_at": session.opened_at, "closed_at": session.closed_at, "auto_close_at": session.auto_close_at,
        "opened_by": person_name(session.opened_by) if session.opened_by else None,
        "helpers": [{"id": u.id, "name": person_name(u)} for u in session.helpers.all()],
        **rules.counts(session),
    }
    if session.event_id:
        data["event"] = {"id": target.id, "title": target.title, "start_date": target.start_date, "end_date": target.end_date}
    else:
        data["class_day"] = {"id": str(target.id), "date": target.date, "topic": target.topic,
                             "course": target.semester_course.course.title}
    return data


def _get_session(pk):
    return get_object_or_404(AttendanceSession.objects.select_related("event", "course_session__semester_course__course"), pk=pk)


def _target_from(data):
    """(event, course_session) from a request body or query dict; raises AttendanceError when missing."""
    event_id, cs_id = data.get("event_id"), data.get("course_session_id")
    if event_id:
        return get_object_or_404(Event, pk=event_id), None
    if cs_id:
        return None, get_object_or_404(CourseSession.objects.select_related("semester_course"), pk=cs_id)
    raise rules.AttendanceError("target", "Give an event or a class day.")


def _scan_one(session, scanner, badge_text, scanned_at_text=None):
    """One badge scan -> dict with ok / student / already / error. Never raises: the sync loop needs one answer per item."""
    parsed = codes.parse_badge(badge_text)
    if parsed is None:
        return {"ok": False, "code": "bad_badge", "detail": "This is not a Finot badge."}
    user_id, version = parsed
    user = User.objects.filter(pk=user_id, is_active=True).select_related("student_profile").first()
    current = getattr(getattr(user, "student_profile", None), "badge_version", None)
    if user is None or current != version:
        return {"ok": False, "code": "old_badge", "detail": "This badge is no longer valid. Ask for a new one."}
    scanned_at = parse_datetime(scanned_at_text) if scanned_at_text else None
    if scanned_at is not None and timezone.is_naive(scanned_at):
        scanned_at = timezone.make_aware(scanned_at, timezone.utc)
    try:
        check_in, created = rules.mark_present(session, user, CheckIn.BADGE, scanned_by=scanner, scanned_at=scanned_at)
    except rules.AttendanceError as exc:
        return {"ok": False, "code": exc.code, "detail": exc.message, "student": _student_card(user)}
    return {"ok": True, "already": not created, "student": _student_card(user), "checked_in_at": check_in.scanned_at}


# ---- organizer --------------------------------------------------------------------------------------------

class OpenSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            event, cs = _target_from(request.data)
            session, created = rules.open_session(request.user, event, cs)
        except rules.AttendanceError as exc:
            return _error(exc)
        return Response(_session_json(session), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CurrentSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            event, cs = _target_from(request.query_params)
        except rules.AttendanceError as exc:
            return _error(exc)
        session = AttendanceSession.objects.filter(event=event, course_session=cs, closed_at__isnull=True).first()
        if session is None:
            return Response({"detail": "No open attendance session."}, status=status.HTTP_404_NOT_FOUND)
        if not (rules.is_scanner(request.user, session) or rules.on_roster(session, request.user)):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        return Response(_session_json(session))


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        session = _get_session(pk)
        if not rules.is_scanner(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        return Response(_session_json(session))


class CloseSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = _get_session(pk)
        if not rules.is_organizer(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        absent = rules.close_session(session, request.user)
        session.refresh_from_db()
        return Response({**_session_json(session), "marked_absent": absent})


class ReopenSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = _get_session(pk)
        if not rules.is_organizer(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        if AttendanceSession.objects.filter(event=session.event, course_session=session.course_session,
                                            closed_at__isnull=True).exclude(pk=session.pk).exists():
            return Response({"code": "another_open", "detail": "Another session is already open for this."}, status=409)
        rules.reopen_session(session)
        return Response(_session_json(session))


class HelpersSerializer(serializers.Serializer):
    user_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)


class HelpersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = _get_session(pk)
        if not rules.is_organizer(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        ser = HelpersSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session.helpers.set(User.objects.filter(pk__in=ser.validated_data["user_ids"], is_active=True))
        return Response(_session_json(session))


# ---- scanner ----------------------------------------------------------------------------------------------

class RoomCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        session = _get_session(pk)
        if not rules.is_scanner(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        if not session.is_open:
            return Response({"code": "closed", "detail": "Attendance is closed for this session."}, status=409)
        return Response({"code": codes.room_code(session.id), "seconds_left": codes.seconds_left(),
                         "qr": codes.room_qr_text(session.id), "window_seconds": codes.ROOM_WINDOW_SECONDS,
                         **rules.counts(session)})


class ScanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = _get_session(pk)
        if not rules.is_scanner(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        result = _scan_one(session, request.user, request.data.get("badge"), request.data.get("scanned_at"))
        result.update(rules.counts(session))
        return Response(result, status=status.HTTP_200_OK if result["ok"] else status.HTTP_400_BAD_REQUEST)


class SyncView(APIView):
    """The offline queue: a list of scans made without network. Repeating the same list is harmless."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        session = _get_session(pk)
        if not rules.is_scanner(request.user, session):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        scans = request.data.get("scans")
        if not isinstance(scans, list) or len(scans) > 500:
            return Response({"detail": "Send a list of at most 500 scans."}, status=status.HTTP_400_BAD_REQUEST)
        results = [_scan_one(session, request.user, (s or {}).get("badge"), (s or {}).get("scanned_at")) for s in scans]
        return Response({"results": results, "accepted": sum(1 for r in results if r["ok"]), **rules.counts(session)})


# ---- student ----------------------------------------------------------------------------------------------

class MyBadgeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = StudentProfile.objects.get_or_create(user=request.user)
        return Response({"badge": codes.badge_for(request.user.id, profile.badge_version),
                         "name": person_name(request.user), "version": profile.badge_version})


class SelfCheckInView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SelfCheckInThrottle]

    def post(self, request, pk):
        session = _get_session(pk)
        if not session.is_open:
            return Response({"code": "closed", "detail": "Attendance is closed for this session."}, status=409)
        if not codes.room_code_is_valid(session.id, request.data.get("code")):
            return Response({"code": "wrong_code", "detail": "Wrong or expired code. Read the screen again."}, status=400)
        try:
            check_in, created = rules.mark_present(session, request.user, CheckIn.CODE, scanned_by=None)
        except rules.AttendanceError as exc:
            return _error(exc)
        return Response({"ok": True, "already": not created, "checked_in_at": check_in.scanned_at,
                         "session": _session_json(session)})


class OpenForMeView(APIView):
    """Open sessions this student belongs to, so the app can offer 'Check in' without the student typing an id."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        mine = []
        for session in AttendanceSession.objects.filter(closed_at__isnull=True).select_related(
                "event", "course_session__semester_course__course"):
            if rules.on_roster(session, request.user):
                data = _session_json(session)
                data["checked_in"] = session.check_ins.filter(student=request.user).exists()
                mine.append(data)
        return Response(mine)
