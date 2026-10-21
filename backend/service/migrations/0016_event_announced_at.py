from django.db import migrations, models
from django.db.models import F


def mark_existing_events_as_announced(apps, schema_editor):
    """Events that exist today were announced when they were created; never announce them again on an edit."""
    Event = apps.get_model("service", "Event")
    Event.objects.filter(announced_at__isnull=True).update(announced_at=F("created_at"))


class Migration(migrations.Migration):

    dependencies = [
        ("service", "0015_email_outbox"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="announced_at",
            field=models.DateTimeField(
                blank=True, null=True,
                help_text="When everyone was told about this event (notifications/handlers.py announces once).",
            ),
        ),
        migrations.RunPython(mark_existing_events_as_announced, migrations.RunPython.noop),
    ]
