"""
Make enrolments match the rule "a student takes the courses of their own batch".

  * adds the students of the course's batch who are missing
  * removes enrolments of students from another batch, in courses that are not completed and where that
    student has no attendance (nothing is lost)

Completed courses are history and are never touched. Without --yes it only shows what it would do.
"""
from django.core.management.base import BaseCommand

from course.enrollment import enrol_batch
from course.models import AttendanceRecord, CourseEnrollment, SemesterCourse
from student.models import StudentProfile


class Command(BaseCommand):
    help = "Add missing and remove wrong-batch enrolments in running courses (dry run unless --yes)."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Apply the changes.")

    def handle(self, *args, **options):
        apply = options["yes"]
        for sc in SemesterCourse.objects.exclude(status=SemesterCourse.COMPLETED).select_related("course"):
            batch = sc.course.batch_year
            have = set(CourseEnrollment.objects.filter(semester_course=sc).values_list("student_id", flat=True))
            should = set(
                StudentProfile.objects.filter(batch_year=batch, status=StudentProfile.IN_CAMPUS, user__is_active=True)
                .values_list("user_id", flat=True)
            )
            missing = should - have
            wrong = []
            for enrolment in CourseEnrollment.objects.filter(semester_course=sc).exclude(student_id__in=should).select_related("student"):
                marked = AttendanceRecord.objects.filter(session__semester_course=sc, student=enrolment.student).exists()
                if not marked:
                    wrong.append(enrolment)
            self.stdout.write(f"{sc} (batch {batch}): add {len(missing)}, remove {len(wrong)} wrong-batch")
            for enrolment in wrong:
                self.stdout.write(f"    remove {enrolment.student.username}")
            if apply:
                if missing:
                    enrol_batch(sc)
                CourseEnrollment.objects.filter(pk__in=[e.pk for e in wrong]).delete()
        self.stdout.write("Done." if apply else "Dry run only. Add --yes to apply.")
