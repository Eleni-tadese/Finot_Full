"""
Close every attendance session that the organizer forgot to close (past its auto_close_at).
Run by the daily cron (see .github/workflows) or by hand: python manage.py close_stale_attendance_sessions
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from attendance.models import AttendanceSession
from attendance.rules import close_session


class Command(BaseCommand):
    help = "Close forgotten attendance sessions and mark the rest of their roster Absent."

    def handle(self, *args, **options):
        stale = AttendanceSession.objects.filter(closed_at__isnull=True, auto_close_at__lte=timezone.now())
        closed, absent = 0, 0
        for session in stale:
            absent += close_session(session, user=None)
            closed += 1
        self.stdout.write(f"closed {closed} session(s), marked {absent} student(s) absent")
