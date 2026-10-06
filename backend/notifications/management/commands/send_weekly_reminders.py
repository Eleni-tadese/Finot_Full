from django.core.management.base import BaseCommand

from notifications.reminders import send_weekly_reminders


class Command(BaseCommand):
    help = (
        "Sends the weekly donation reminder to all active in-campus students. "
        "Skips if one was already sent in the last 6 days (use --force to override)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Send even if sent recently.")

    def handle(self, *args, **opts):
        result = send_weekly_reminders(force=opts["force"])
        if result["status"] == "sent":
            self.stdout.write(self.style.SUCCESS(
                f"Successfully processed {result['users']} users, sent FCM to {result['devices']} devices and "
                f"{result['emails']} emails ({result['emails_skipped']} over the email limit)."
            ))
        else:
            self.stdout.write(self.style.WARNING(f"Nothing sent: {result['reason']}."))
