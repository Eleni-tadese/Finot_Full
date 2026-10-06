from datetime import date

from django.core.management.base import BaseCommand, CommandError

from notifications.class_reminders import send_class_reminders


class Command(BaseCommand):
    help = (
        "Tells the students of every class that meets TOMORROW (Ethiopia time) about it. "
        "Each class day is announced once; run it daily."
    )

    def add_arguments(self, parser):
        parser.add_argument("--today", help="Pretend today is this date (YYYY-MM-DD), for testing.")
        parser.add_argument("--force", action="store_true", help="Announce again even if already announced.")

    def handle(self, *args, **opts):
        try:
            today = date.fromisoformat(opts["today"]) if opts["today"] else None
        except ValueError:
            raise CommandError("--today must look like 2026-10-06")
        result = send_class_reminders(today=today, force=opts["force"])
        self.stdout.write(self.style.SUCCESS(
            f"Announced {result['sessions']} class day(s) to {result['students']} student(s) ({result['devices']} devices)."
        ))
