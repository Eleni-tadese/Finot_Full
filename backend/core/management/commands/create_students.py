"""
Create a batch of plain student accounts, so you do not have to register them one by one.

    python manage.py create_students --start 11 --count 20 --password 'Finot@12345!'

Makes student11@finot.test ... student30@finot.test. Each is named after its email
(first, father's and grandfather's name all "student11"), genders alternate M/F, and the profile is filled in
(batch, department, dorm block/room, section, phone) so families, groups and courses can be tested.
Without --batch the accounts are spread over years 1-5 and five departments (5 x 5 combinations);
with --batch every account gets that one year.
Accounts that already exist are skipped. No roles are given: give them in Dashboard > Users & roles.
"""
import zlib

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from core.models import User
from student.models import StudentProfile

DEPARTMENTS = [
    "Computer Science", "Software Engineering", "Electrical and Computer Engineering", "Architecture", "Pharmacy",
]


class Command(BaseCommand):
    help = "Create plain student accounts (student11, student12, ...) with one common password."

    def add_arguments(self, parser):
        parser.add_argument("--start", type=int, default=11, help="First number (default 11).")
        parser.add_argument("--count", type=int, default=20, help="How many accounts (default 20).")
        parser.add_argument("--prefix", default="student")
        parser.add_argument("--domain", default="finot.test")
        parser.add_argument("--password", required=True)
        parser.add_argument("--batch", type=int, default=None, help="Year of study 1-5 for everyone (default: spread over 1-5).")
        parser.add_argument("--force", action="store_true", help="Run even when DEBUG is False.")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("Refusing to create test accounts while DEBUG is off. Use --force if you are sure.")
        if opts["batch"] is not None and not 1 <= opts["batch"] <= 5:
            raise CommandError("--batch must be between 1 and 5.")
        if opts["count"] < 1:
            raise CommandError("--count must be at least 1.")
        try:
            validate_password(opts["password"])
        except ValidationError as exc:
            raise CommandError("Password: " + "; ".join(exc.messages))

        created = skipped = 0
        for i in range(opts["count"]):
            number = opts["start"] + i
            name = f"{opts['prefix']}{number}"
            email = f"{name}@{opts['domain']}"
            if User.objects.filter(email__iexact=email).exists():
                skipped += 1
                continue
            user = User.objects.create_user(
                username=email, email=email, password=opts["password"],
                first_name=name, middle_name=name, last_name=name,
                gender="M" if number % 2 else "F",
            )
            StudentProfile.objects.update_or_create(
                user=user,
                defaults={
                    "batch_year": opts["batch"] if opts["batch"] is not None else (i % 5) + 1,
                    "department": DEPARTMENTS[(i // 5) % len(DEPARTMENTS)],
                    "dorm_block": (number % 4) + 1,
                    "dorm_room": 300 + number,
                    "section": (number % 5) + 1,
                    "personal_phone": f"09{(zlib.crc32(email.encode()) % 90000000) + 10000000}",
                    "telegram_username": name,
                    "status": StudentProfile.IN_CAMPUS,
                },
            )
            created += 1

        last = opts["start"] + opts["count"] - 1
        self.stdout.write(self.style.SUCCESS(
            f"Created {created}, skipped {skipped} that already existed "
            f"({opts['prefix']}{opts['start']} to {opts['prefix']}{last})."
        ))
