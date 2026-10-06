"""
Seed the database with FAKE demo data for local development.

    python manage.py seed_demo

Safe to run more than once (it updates instead of duplicating).
All accounts use the email domain @finot.test and the same fake password
(see DEMO_PASSWORD). Never run this against a real production database.
"""
import datetime

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Role, User, UserRole
from course.models import (
    AttendanceRecord,
    Course,
    CourseEnrollment,
    CourseSession,
    SemesterCourse,
)
from questionanswer.models import Answer, Question, TeacherSpecialization
from resources.models import Material
from service.models import (
    AgeglotSelection,
    Event,
    Family,
    FamilyMembership,
    ServiceAttendance,
    ServiceConfiguration,
    ServiceGroup,
    ServiceGroupMembership,
)
from student.models import StudentProfile

DEMO_PASSWORD = "Finot@12345"  # fake, local-only

# (email, first, middle, last, gender, role)
STAFF = [
    ("superadmin@finot.test", "Sara", "Abebe", "Kebede", "F", Role.SUPER_ADMIN),
    ("serviceadmin@finot.test", "Samuel", "Tadesse", "Bekele", "M", Role.SERVICE_ADMIN),
    ("coordinator@finot.test", "Hanna", "Girma", "Alemu", "F", Role.COURSE_COORDINATOR),
    ("eventmanager@finot.test", "Daniel", "Haile", "Mekonnen", "M", Role.EVENT_MANAGER),
    ("counselor@finot.test", "Mariam", "Desta", "Wolde", "F", Role.QA_COUNSELOR),
    ("moderator@finot.test", "Yonas", "Getachew", "Assefa", "M", Role.QA_MODERATOR),
    ("father@finot.test", "Abel", "Tesfaye", "Negash", "M", Role.FAMILY_ADMIN),
    ("mother@finot.test", "Selam", "Yosef", "Lemma", "F", Role.FAMILY_ADMIN),
]
# (email, first, middle, last, gender, department, dorm_block, dorm_room)
STUDENTS = [
    ("student1@finot.test", "Biruk", "Lulseged", "Tilahun", "M", "Software Engineering", 12, 101),
    ("student2@finot.test", "Eden", "Kidus", "Worku", "F", "Mechanical Engineering", 7, 205),
    ("student3@finot.test", "Nahom", "Fikru", "Berhanu", "M", "Electrical Engineering", 12, 102),
]
GROUPS = {
    "Choir": {
        "summary": "Hymns and worship through song.",
        "description": "The choir leads the singing at fellowship programs, feast days and special services.",
        "activities": "Weekly rehearsal\nSinging at Sunday and feast-day programs\nLearning new hymns\nSmall-group voice practice",
        "requirements": "A love of hymns. No training needed; we teach.",
        "commitment": "Rehearsal on Saturdays, 2 hours",
        "contact_info": "Ask the group admin after the program",
    },
    "Charity": {
        "summary": "Helping students and families in need.",
        "description": "We organize collections and visits to support students and families in need.",
        "activities": "Collecting food and clothes\nVisiting families\nTutoring younger students",
        "requirements": "A caring heart and some free time on weekends.",
        "commitment": "One weekend a month",
        "contact_info": "Ask the group admin after the program",
    },
    "Media": {
        "summary": "Photography, video and graphics for the fellowship.",
        "description": "We record programs and design announcements and posters.",
        "activities": "Photographing events\nEditing short videos\nDesigning posters",
        "requirements": "Any experience with a camera, editing or design helps.",
        "commitment": "During events, plus about 2 hours a week",
        "contact_info": "Ask the group admin after the program",
    },
    "Teaching": {
        "summary": "Preparing lessons and teaching materials.",
        "description": "We prepare weekly lessons and study materials for members.",
        "activities": "Writing lessons\nTeaching small classes\nPreparing study handouts",
        "requirements": "Comfort speaking in front of a small group.",
        "commitment": "A weekly class plus preparation time",
        "contact_info": "Ask the group admin after the program",
    },
    "Evangelism": {
        "summary": "Outreach and inviting new members.",
        "description": "We welcome new students and invite them to the fellowship.",
        "activities": "Welcoming first-year students\nOrienting new members\nOrganizing open days",
        "requirements": "Friendly and patient with newcomers.",
        "commitment": "Mostly at the start of each semester",
        "contact_info": "Ask the group admin after the program",
    },
    "Prayer": {
        "summary": "Organizing prayer programs.",
        "description": "We prepare and lead prayer programs for the fellowship.",
        "activities": "Planning prayer sessions\nLeading prayers\nPreparing prayer materials",
        "requirements": "Interest in prayer and the liturgy.",
        "commitment": "Weekly prayer program",
        "contact_info": "Ask the group admin after the program",
    },
}


class Command(BaseCommand):
    help = "Create FAKE demo data (users, groups, family, events, course, Q&A) for local development."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Run even when DEBUG is False.")

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError("Refusing to seed fake data while DEBUG is False (use --force to override).")

        # Never send real emails/push/in-app notifications to fake users:
        # creating an UPCOMING event would otherwise email every active user.
        from notifications.dispatch import NotificationDispatcher

        NotificationDispatcher._channels = []

        call_command("setup_rbac", verbosity=0)
        roles = {r.name: r for r in Role.objects.all()}

        # ---- Users ----
        users = {}
        for email, first, middle, last, gender, role in STAFF:
            user = self._user(email, first, middle, last, gender)
            UserRole.objects.get_or_create(user=user, role=roles[role])
            users[email] = user
        students = []
        for email, first, middle, last, gender, dept, block, room in STUDENTS:
            user = self._user(email, first, middle, last, gender)
            UserRole.objects.get_or_create(user=user, role=roles[Role.STUDENT])
            StudentProfile.objects.filter(user=user).update(
                batch_year=1,
                department=dept,
                dorm_block=block,
                dorm_room=room,
                section=1,
                telegram_username=email.split("@")[0],
                personal_phone="0911000000",
                emergency_name="Fake Parent",
                emergency_phone="0911000001",
                emergency_relation="Parent",
                home_address="Adama",
                status=StudentProfile.IN_CAMPUS,
            )
            students.append(user)
        s1, s2, s3 = students
        admin_user = users["serviceadmin@finot.test"]

        # ---- Service groups ----
        groups = {}
        for name, info in GROUPS.items():
            groups[name], _ = ServiceGroup.objects.get_or_create(name=name, defaults=info)
        groups["Choir"].admin = admin_user
        groups["Choir"].save()
        ServiceConfiguration.objects.get_or_create(pk=1, defaults={"is_selection_open": True})
        ServiceGroupMembership.objects.update_or_create(
            student=s1,
            service_group=groups["Choir"],
            defaults={
                "role": ServiceGroupMembership.MEMBER,
                "status": ServiceGroupMembership.ACTIVE,
            },
        )
        for priority, name in enumerate(["Media", "Teaching", "Prayer"], start=1):
            AgeglotSelection.objects.update_or_create(
                student=s2,
                priority=priority,
                defaults={
                    "service_group": groups[name],
                    "skills": "Photoshop, public speaking",
                    "reason": "I want to serve with my skills.",
                },
            )

        # ---- Family ----
        family, _ = Family.objects.get_or_create(
            name="Family of Grace",
            defaults={
                "father": users["father@finot.test"],
                "mother": users["mother@finot.test"],
                "religious_father": "Abba Fake Name",
            },
        )
        for student in students:
            FamilyMembership.objects.get_or_create(student=student, defaults={"family": family})

        # ---- Events ----
        now = timezone.now()
        manager = users["eventmanager@finot.test"]
        Event.objects.get_or_create(
            title="Fellowship Welcome Day",
            defaults={
                "description": "Open to all members.",
                "start_date": now + datetime.timedelta(days=7),
                "end_date": now + datetime.timedelta(days=7, hours=3),
                "status": Event.UPCOMING,
                "place_name": "Main Hall",
                "created_by": manager,
            },
        )
        Event.objects.get_or_create(
            title="Choir Rehearsal",
            defaults={
                "description": "Weekly choir practice.",
                "start_date": now + datetime.timedelta(days=2),
                "end_date": now + datetime.timedelta(days=2, hours=2),
                "status": Event.UPCOMING,
                "service_group": groups["Choir"],
                "place_name": "Room 12",
                "created_by": admin_user,
            },
        )
        past, _ = Event.objects.get_or_create(
            title="Last Week Prayer Night",
            defaults={
                "description": "Evening prayer.",
                "start_date": now - datetime.timedelta(days=7),
                "end_date": now - datetime.timedelta(days=7) + datetime.timedelta(hours=2),
                "status": Event.COMPLETED,
                "created_by": manager,
            },
        )
        for student, status in zip(
            students, [ServiceAttendance.PRESENT, ServiceAttendance.PRESENT, ServiceAttendance.ABSENT]
        ):
            ServiceAttendance.objects.update_or_create(event=past, student=student, defaults={"status": status})

        # ---- Course with sessions and attendance ----
        coordinator = users["coordinator@finot.test"]
        course, _ = Course.objects.get_or_create(
            title="Bible Doctrine 101", batch_year=1, defaults={"description": "Fake intro course."}
        )
        semester_course, _ = SemesterCourse.objects.get_or_create(
            course=course, academic_year=now.year, semester=1
        )
        semester_course.coordinators.add(coordinator)
        for student in students:
            CourseEnrollment.objects.get_or_create(semester_course=semester_course, student=student)
        statuses = {
            s1: ["PRESENT", "PRESENT", "ABSENT"],
            s2: ["PRESENT", "ABSENT", "PRESENT"],
            s3: ["ABSENT", "PRESENT", "PRESENT"],
        }
        today = datetime.date.today()
        for i in range(3):
            session, _ = CourseSession.objects.get_or_create(
                semester_course=semester_course,
                date=today - datetime.timedelta(days=7 * (3 - i)),
                defaults={"topic": f"Lesson {i + 1}", "teacher_name": "Fake Teacher"},
            )
            for student in students:
                AttendanceRecord.objects.update_or_create(
                    session=session,
                    student=student,
                    defaults={"status": statuses[student][i], "marked_by": coordinator},
                )

        # ---- Q&A ----
        counselor = users["counselor@finot.test"]
        for spec in (TeacherSpecialization.ACADEMIC, TeacherSpecialization.SOUL_TEACHER):
            TeacherSpecialization.objects.get_or_create(user=counselor, specialization=spec)
        q1, _ = Question.objects.get_or_create(
            question_body="How can I balance study and fellowship activities?",
            defaults={
                "display_name": "Anonymous Student",
                "category": Question.CAT_ACADEMIC,
                "visibility": Question.VISIBILITY_PUBLIC,
                "is_approved": True,
            },
        )
        Answer.objects.get_or_create(
            question=q1,
            answer_body="Plan your week and keep one fixed fellowship slot.",
            defaults={"display_name": "A Senior Member", "responder": s3, "is_approved": True},
        )
        Question.objects.get_or_create(
            question_body="Is it okay to ask about fasting rules?",
            defaults={
                "display_name": "Curious",
                "category": Question.CAT_SPIRITUAL,
                "visibility": Question.VISIBILITY_PUBLIC,
                "is_approved": False,
                "user": s2,
            },
        )
        q3, _ = Question.objects.get_or_create(
            question_body="I feel stressed about exams and need advice privately.",
            defaults={
                "display_name": s1.get_full_name(),
                "category": Question.CAT_PERSONAL,
                "visibility": Question.VISIBILITY_PRIVATE,
                "is_approved": False,
                "user": s1,
            },
        )
        Answer.objects.get_or_create(
            question=q3,
            answer_body="Take it step by step, and let us talk after service.",
            defaults={
                "display_name": counselor.get_full_name(),
                "responder": counselor,
                "is_approved": True,
            },
        )

        # ---- A general material (link only, no file upload needed) ----
        Material.objects.get_or_create(
            title="Fellowship Guide (fake link)",
            defaults={
                "description": "Example general material.",
                "url": "https://example.com/guide",
                "material_type": Material.MaterialType.GENERAL,
                "uploaded_by": users["superadmin@finot.test"],
            },
        )

        self.stdout.write(self.style.SUCCESS("Fake demo data ready."))
        self.stdout.write(f"Password for every account: {DEMO_PASSWORD}  (fake, local only)")
        for email, *_rest, role in STAFF:
            self.stdout.write(f"  {role:<18} {email}")
        for email, *_rest in STUDENTS:
            self.stdout.write(f"  {'Student':<18} {email}")

    def _user(self, email, first, middle, last, gender):
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": first,
                "middle_name": middle,
                "last_name": last,
                "gender": gender,
            },
        )
        user.set_password(DEMO_PASSWORD)
        user.save()
        return user
