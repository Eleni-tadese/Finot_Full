from django.core.management.base import BaseCommand

from notifications.account_setup_reminders import send_account_setup_reminders


class Command(BaseCommand):
    help = "Remind students who still use their login slip to add a real email and a new password (once per stage)."

    def handle(self, *args, **options):
        result = send_account_setup_reminders()
        self.stdout.write(self.style.SUCCESS(f"Checked {result['checked']}, reminded {result['reminded']}, pushed to {result['devices']} devices."))
