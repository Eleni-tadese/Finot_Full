from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0008_studentprofile_language"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="email_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
