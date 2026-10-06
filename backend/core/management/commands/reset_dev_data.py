"""
Start over: empty every table, recreate the roles and one Super Admin.

    python manage.py reset_dev_data --yes            # then admin@finot.test / Finot@12345 exists
    python manage.py reset_dev_data --yes --empty    # completely empty: no roles, no users at all
                                                     # (then run: python manage.py create_first_admin)

Development only. It deletes ALL data in the configured database (users, groups, events, questions,
donations...). Files already uploaded to Cloudinary are not touched.
"""
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

DEFAULT_ADMIN_EMAIL = "admin@finot.test"
DEFAULT_ADMIN_PASSWORD = "Finot@12345"


class Command(BaseCommand):
    help = "DEVELOPMENT ONLY: delete all data, recreate roles and one Super Admin."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Confirm that ALL data may be deleted.")
        parser.add_argument("--empty", action="store_true", help="Leave the database completely empty (no roles, no admin).")
        parser.add_argument("--force", action="store_true", help="Run even when DEBUG is False.")
        parser.add_argument("--admin-email", default=DEFAULT_ADMIN_EMAIL)
        parser.add_argument("--admin-password", default=DEFAULT_ADMIN_PASSWORD)

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("Refusing to wipe data while DEBUG is off. Use --force only if you are sure.")
        if not opts["yes"]:
            raise CommandError("This deletes ALL data. Run again with --yes to confirm.")

        from core.models import Role, User, UserRole

        call_command("flush", interactive=False, verbosity=0)
        if opts["empty"]:
            self.stdout.write(self.style.SUCCESS(
                "Database is completely empty. Next: python manage.py create_first_admin"
            ))
            return
        call_command("setup_rbac", verbosity=0)
        admin = User.objects.create_user(
            username=opts["admin_email"], email=opts["admin_email"], password=opts["admin_password"],
            first_name="Finot", last_name="Admin", gender="F",
        )
        UserRole.objects.create(user=admin, role=Role.objects.get(name=Role.SUPER_ADMIN))
        self.stdout.write(self.style.SUCCESS(
            f"Database is empty. Super Admin: {opts['admin_email']} / {opts['admin_password']}"
        ))
