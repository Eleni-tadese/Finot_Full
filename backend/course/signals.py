from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from student.models import StudentProfile

from .enrollment import enrol_batch, enrol_student
from .models import Course, SemesterCourse


@receiver(post_save, sender=SemesterCourse)
def enrol_students_when_a_course_opens(sender, instance, created, **kwargs):
    if created:
        enrol_batch(instance)


@receiver(pre_save, sender=StudentProfile)
def remember_year_and_stage(sender, instance, **kwargs):
    instance._before = StudentProfile.objects.filter(pk=instance.pk).values("batch_year", "status").first()


@receiver(post_save, sender=StudentProfile)
def enrol_student_when_year_changes(sender, instance, created, **kwargs):
    before = getattr(instance, "_before", None)
    if created or before is None or before["batch_year"] != instance.batch_year or before["status"] != instance.status:
        enrol_student(instance.user)


@receiver(pre_save, sender=Course)
def remember_curriculum_batch(sender, instance, **kwargs):
    instance._batch_before = Course.objects.filter(pk=instance.pk).values_list("batch_year", flat=True).first()


@receiver(post_save, sender=Course)
def enrol_new_batch_when_curriculum_batch_changes(sender, instance, created, **kwargs):
    """Moving a curriculum to another batch enrols that batch in its running courses (old enrolments stay as history)."""
    before = getattr(instance, "_batch_before", None)
    if created or before is None or before == instance.batch_year:
        return
    for semester_course in instance.semester_courses.exclude(status=SemesterCourse.COMPLETED):
        enrol_batch(semester_course)
