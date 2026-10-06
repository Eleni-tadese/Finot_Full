"""
Create the sample PEOPLE used by FULL_FLOW_TEST_GUIDE.md (accounts only: no groups, events, questions...).

    python manage.py seed_people                 # 13 named accounts, all plain students
    python manage.py seed_people --freshers 12   # plus 12 first-year students for the family distribution test
    python manage.py seed_people --with-roles    # also give the staff roles (skip this to practise "Users & roles")

All accounts use the password Finot@12345 and an @finot.test email. Safe to run again.
"""
import zlib

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Role, User, UserRole
from student.models import StudentProfile

PASSWORD = "Finot@12345"

# email, first, middle, last, gender, batch, role it is meant for (given only with --with-roles)
PEOPLE = [
    ("abebe@finot.test", "Abebe", "Kebede", "Desta", "M", 1, None),
    ("selam@finot.test", "Selam", "Tadesse", "Bekele", "F", 1, None),
    ("dawit@finot.test", "Dawit", "Alemu", "Girma", "M", 1, None),
    ("marta@finot.test", "Marta", "Hailu", "Tesfaye", "F", 1, None),
    ("yonas@finot.test", "Yonas", "Mulugeta", "Abate", "M", 3, Role.SERVICE_ADMIN),
    ("hanna@finot.test", "Hanna", "Worku", "Demissie", "F", 3, Role.SERVICE_ADMIN),
    ("eventmgr@finot.test", "Eleni", "Assefa", "Negash", "F", 4, Role.EVENT_MANAGER),
    ("counselor@finot.test", "Tigist", "Bekele", "Lemma", "F", 5, Role.QA_COUNSELOR),
    ("psychotherapist@finot.test", "Fikru", "Haile", "Wolde", "M", 5, Role.QA_COUNSELOR),
    ("moderator@finot.test", "Mulu", "Gebre", "Tilahun", "F", 4, Role.QA_MODERATOR),
    ("coordinator@finot.test", "Kidist", "Solomon", "Zewde", "F", 4, Role.COURSE_COORDINATOR),
    ("father@finot.test", "Abel", "Tesfaye", "Negash", "M", 5, None),
    ("mother@finot.test", "Hiwot", "Yosef", "Lemma", "F", 5, None),
]

FIRST_M = ["Biniam", "Henok", "Samuel", "Natnael", "Yared", "Mikias", "Eyob", "Robel", "Amanuel", "Tamirat", "Bereket", "Surafel"]
FIRST_F = ["Betty", "Rahel", "Meron", "Saron", "Liya", "Bethel", "Eden", "Mahlet", "Rediet", "Tsion", "Hiwot", "Aster"]
FATHER_NAMES = ["Alemayehu", "Getachew", "Mekonnen", "Tsegaye", "Wondimu", "Belay", "Fekadu", "Assefa", "Teshome", "Zeleke", "Yilma", "Berhanu"]


class Command(BaseCommand):
    help = "Create the sample people for the full-flow test guide (accounts only)."

    def add_arguments(self, parser):
        parser.add_argument("--freshers", type=int, default=0, help="Also create N first-year students.")
        parser.add_argument("--with-roles", action="store_true", help="Also give the staff roles.")
        parser.add_argument("--force", action="store_true", help="Run even when DEBUG is False.")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("Refusing to create sample accounts while DEBUG is off. Use --force if you are sure.")
        student_role, _ = Role.objects.get_or_create(name=Role.STUDENT)
        created = 0

        def make(email, first, middle, last, gender, batch, block, room, section, role):
            nonlocal created
            user, was_created = User.objects.get_or_create(
                email=email,
                defaults={"username": email, "first_name": first, "middle_name": middle, "last_name": last, "gender": gender},
            )
            if was_created:
                user.set_password(PASSWORD)
                user.save()
                created += 1
            UserRole.objects.get_or_create(user=user, role=student_role)
            if role and opts["with_roles"]:
                UserRole.objects.get_or_create(user=user, role=Role.objects.get_or_create(name=role)[0])
            StudentProfile.objects.update_or_create(
                user=user,
                defaults={
                    "batch_year": batch, "department": "Computer Science" if batch < 4 else "Software Engineering",
                    "dorm_block": block, "dorm_room": room, "section": section,
                    "personal_phone": f"09{(zlib.crc32(email.encode()) % 90000000) + 10000000}",
                    "telegram_username": email.split("@")[0], "status": StudentProfile.IN_CAMPUS,
                },
            )

        for i, (email, first, middle, last, gender, batch, role) in enumerate(PEOPLE):
            make(email, first, middle, last, gender, batch, (i % 3) + 1, 100 + i, (i % 4) + 1, role)

        for i in range(opts["freshers"]):
            gender = "M" if i % 2 == 0 else "F"
            first = (FIRST_M if gender == "M" else FIRST_F)[(i // 2) % 12]
            make(f"fresher{i + 1:02d}@finot.test", first, FATHER_NAMES[i % 12], "Fresher", gender, 1, (i % 4) + 1, 200 + i, (i % 5) + 1, None)

        self.stdout.write(self.style.SUCCESS(f"Created {created} account(s). Password for all: {PASSWORD}"))
