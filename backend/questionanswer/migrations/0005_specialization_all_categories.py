from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("questionanswer", "0004_teacher_specialization_and_assignment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="teacherspecialization",
            name="specialization",
            field=models.CharField(
                choices=[
                    ("ACADEMIC", "Academic"),
                    ("SOUL_TEACHER", "Spiritual (soul teacher)"),
                    ("FAMILY", "Family"),
                    ("PSYCHOTHERAPIST", "Personal (psychotherapist)"),
                    ("OTHER", "Other"),
                ],
                max_length=20,
            ),
        ),
    ]
