"""
Close every attendance session that the organizer forgot to close (past its auto_close_at).
Run every 6 hours by the email-outbox cron (notifications/outbox.py) or by hand: python manage.py close_stale_attendance_sessions
"""
from django.core.management.base import BaseCommand

from attendance.rules import close_stale_sessions


class Command(BaseCommand):
    help = "Close forgotten attendance sessions and mark the rest of their roster Absent."

    def handle(self, *args, **options):
        closed, absent = close_stale_sessions()
        self.stdout.write(f"closed {closed} session(s), marked {absent} student(s) absent")
