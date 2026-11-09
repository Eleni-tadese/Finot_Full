from django.db import migrations, models


class Migration(migrations.Migration):
    # Safe for the code that is live: one new column with a database default (db_default), so an older version of the
    # program that does not know the column can still insert and update this table.

    dependencies = [
        ('notifications', '0008_qa_answer_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailconfiguration',
            name='weekly_reminders_on',
            field=models.BooleanField(
                db_default=True, default=True,
                help_text='Super Admin switch: while off, the Thursday donation reminder is not sent at all (app message, push, SMS, email).',
            ),
        ),
    ]
