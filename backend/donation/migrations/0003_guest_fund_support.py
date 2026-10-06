from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("donation", "0002_alter_studentdonation_fund_category"),
    ]

    operations = [
        migrations.AlterField(
            model_name="nonstudentdonation",
            name="fund_category",
            field=models.CharField(
                choices=[
                    ("WEEKLY", "Weekly Collection"),
                    ("BUILDING", "Building Fund"),
                    ("CHARITY", "Charity"),
                    ("SUPPORT", "Support the Gibi Gubae"),
                ],
                max_length=50,
            ),
        ),
    ]
