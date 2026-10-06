"""
Create the very first Super Admin on an empty database. You type every detail yourself.

    python manage.py create_first_admin

Everything else (other users, roles, groups...) is then done from the website:
register people at /register, give roles in Dashboard > Users & roles.

Refuses to run if a Super Admin already exists (use --force to add another one).
The --email / --first-name / ... / --password options exist for scripts and tests; normally leave them out
and answer the questions, so the password never appears in your shell history.
"""
from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from core.models import Role, User, UserRole


class Command(BaseCommand):
    help = "Create the first Super Admin (interactive)."

    def add_arguments(self, parser):
        parser.add_argument("--email")
        parser.add_argument("--first-name")
        parser.add_argument("--middle-name")
        parser.add_argument("--last-name")
        parser.add_argument("--gender", choices=["M", "F"])
        parser.add_argument("--password")
        parser.add_argument("--force", action="store_true", help="Create one even if a Super Admin exists.")

    def ask(self, label, given, validator=None):
        value = given
        while True:
            if value is None:
                value = input(f"{label}: ").strip()
            try:
                if not value:
                    raise ValidationError("This field is required.")
                if validator:
                    validator(value)
                return value
            except ValidationError as exc:
                if given is not None:
                    raise CommandError(f"{label}: {'; '.join(exc.messages)}")
                self.stderr.write(self.style.ERROR("  " + "; ".join(exc.messages)))
                value = None

    def handle(self, *args, **opts):
        if UserRole.objects.filter(role__name=Role.SUPER_ADMIN).exists() and not opts["force"]:
            raise CommandError("A Super Admin already exists. Log in with it, or use --force to add another.")

        def gender_check(v):
            if v not in ("M", "F"):
                raise ValidationError("Type M or F.")

        email = self.ask("Email (this is your login)", opts["email"], validate_email).lower()
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("A user with this email already exists.")
        first = self.ask("First name", opts["first_name"])
        middle = self.ask("Father's name", opts["middle_name"])
        last = self.ask("Grandfather's name", opts["last_name"])
        gender = self.ask("Gender (M/F)", opts["gender"], gender_check).upper()

        password = opts["password"]
        while True:
            if password is None:
                password = getpass("Password (hidden): ")
                if password != getpass("Password again: "):
                    self.stderr.write(self.style.ERROR("  The two passwords differ."))
                    password = None
                    continue
            try:
                validate_password(password)
                break
            except ValidationError as exc:
                if opts["password"] is not None:
                    raise CommandError("Password: " + "; ".join(exc.messages))
                self.stderr.write(self.style.ERROR("  " + "; ".join(exc.messages)))
                password = None

        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first, middle_name=middle, last_name=last, gender=gender,
        )
        UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=Role.SUPER_ADMIN)[0])
        self.stdout.write(self.style.SUCCESS(
            f"Super Admin created: {email}. Log in at the website's /login page."
        ))
