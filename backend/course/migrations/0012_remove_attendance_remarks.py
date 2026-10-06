from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("course", "0011_semestercourse_status"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="attendancerecord",
            name="remarks",
        ),
    ]
