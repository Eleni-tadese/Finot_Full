from django.db import migrations, models


def existing_courses_are_open(apps, schema_editor):
    """Courses that existed before this field were already visible to students: keep them running."""
    apps.get_model("course", "SemesterCourse").objects.update(status="OPEN")


class Migration(migrations.Migration):

    dependencies = [
        ("course", "0010_attendance_remarks"),
    ]

    operations = [
        migrations.AddField(
            model_name="semestercourse",
            name="status",
            field=models.CharField(
                choices=[("PLANNED", "Not started"), ("OPEN", "Open"), ("COMPLETED", "Completed")],
                default="PLANNED",
                help_text="Set by the coordinator. Not started: students do not see it. Open: running. Completed: finished, students keep the materials and their attendance.",
                max_length=10,
            ),
        ),
        migrations.RunPython(existing_courses_are_open, migrations.RunPython.noop),
    ]
