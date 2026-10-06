from django.core.management.base import BaseCommand

from donation.settle import recheck_pending_payments


class Command(BaseCommand):
    help = "Ask Chapa again about pending (and recently failed) donations and settle them."

    def handle(self, *args, **options):
        r = recheck_pending_payments()
        self.stdout.write(
            f"Checked {r['checked']}: {r['completed']} completed, {r['failed']} marked failed, {r['left']} left as they were."
        )
