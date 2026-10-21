from django.core.management.base import BaseCommand

from notifications.reminders import send_weekly_reminders


class Command(BaseCommand):
    help = (
        "Sends the weekly donation reminder to all active in-campus students. "
        "Skips if one was already sent in the last 6 days (use --force to override)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Send even if sent recently.")
        parser.add_argument(
            "--test-email", metavar="ADDRESS",
            help="Send ONE reminder email to this address only, to check that mail works and how it looks. "
                 "Nobody else is notified and nothing is recorded.",
        )

    def handle(self, *args, **opts):
        if opts["test_email"]:
            from notifications.reminders import send_reminder_emails

            sent = send_reminder_emails([(opts["test_email"], "Test")])
            if sent:
                self.stdout.write(self.style.SUCCESS("Test reminder sent. Check that inbox (and the spam folder)."))
            else:
                self.stdout.write(self.style.ERROR("The test email could not be sent. See the log above."))
            return
        result = send_weekly_reminders(force=opts["force"])
        if result["status"] == "sent":
            self.stdout.write(self.style.SUCCESS(
                f"Successfully processed {result['users']} users, sent FCM to {result['devices']} devices and "
                f"queued {result['emails']} emails: {result['emails_sent']} sent now, {result['emails_waiting']} waiting for the daily limit."
            ))
        else:
            self.stdout.write(self.style.WARNING(f"Nothing sent: {result['reason']}."))
