from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0007_account_setup"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="language",
            field=models.CharField(default="en", max_length=2),
        ),
    ]
