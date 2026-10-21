from django.db import models
from django.conf import settings


class FCMDeviceToken(models.Model):
    """
    Stores Firebase Cloud Messaging tokens for users.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fcm_tokens")
    device_token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.device_token[:15]}..."


class Notification(models.Model):
    """
    Stores historical notification records.
    """
    TYPE_EVENT = "EVENT"
    TYPE_DONATION = "DONATION"
    TYPE_REMINDER = "REMINDER"
    TYPE_SYSTEM = "SYSTEM"
    TYPE_QA = "QA"

    TYPE_CHOICES = [
        (TYPE_EVENT, "Event"),
        (TYPE_DONATION, "Donation"),
        (TYPE_REMINDER, "Reminder"),
        (TYPE_SYSTEM, "System"),
        (TYPE_QA, "Q&A"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_SYSTEM)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user}: {self.title}"


class SMSConfiguration(models.Model):
    """
    Single settings row edited by the Super Admin (Django admin). SMS is OFF by default.
    """
    enabled = models.BooleanField(default=False, help_text="Master switch. When off, no SMS is ever sent.")
    monthly_limit = models.PositiveIntegerField(
        default=500, help_text="Maximum messages sent per calendar month. Protects the budget."
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SMS configuration"
        verbose_name_plural = "SMS configuration"

    def __str__(self):
        return "SMS configuration"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def sent_this_month(self):
        from django.utils import timezone

        start = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return SMSLog.objects.filter(status=SMSLog.STATUS_SENT, created_at__gte=start).count()

    def remaining_this_month(self):
        return max(self.monthly_limit - self.sent_this_month(), 0)

    def save(self, *args, **kwargs):
        self.pk = 1  # keep it a singleton: saving again updates the same row
        kwargs.pop('force_insert', None)
        super().save(*args, **kwargs)


class SMSLog(models.Model):
    """One row per SMS attempt (sent or not), for auditing and cost tracking."""
    TRIGGER_PRIVATE_ANSWER = "PRIVATE_ANSWER"
    TRIGGER_NEW_EVENT = "NEW_EVENT"
    TRIGGER_DONATION_REMINDER = "DONATION_REMINDER"
    TRIGGER_CHOICES = [
        (TRIGGER_PRIVATE_ANSWER, "Private question answered"),
        (TRIGGER_NEW_EVENT, "New event"),
        (TRIGGER_DONATION_REMINDER, "Weekly donation reminder"),
    ]

    STATUS_SENT = "SENT"
    STATUS_FAILED = "FAILED"
    STATUS_LIMIT = "LIMIT_REACHED"
    STATUS_INVALID_PHONE = "INVALID_PHONE"
    STATUS_CHOICES = [
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
        (STATUS_LIMIT, "Monthly limit reached"),
        (STATUS_INVALID_PHONE, "Invalid phone"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sms_logs")
    phone = models.CharField(max_length=20, blank=True)
    message = models.CharField(max_length=200)
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    provider = models.CharField(max_length=30, blank=True)
    provider_message_id = models.CharField(max_length=100, blank=True)
    error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_trigger_display()} -> {self.phone} ({self.status})"


class EmailConfiguration(models.Model):
    """Single settings row (Super Admin > Messages > Email): how many outbox emails may go out per day (UTC)."""
    daily_limit = models.PositiveIntegerField(
        default=300, help_text="Maximum outbox emails per day. Brevo's free plan allows about 300."
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Email configuration"
        verbose_name_plural = "Email configuration"

    def __str__(self):
        return "Email configuration"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton
        kwargs.pop("force_insert", None)
        super().save(*args, **kwargs)


class EmailOutbox(models.Model):
    """
    One bulk email waiting to be sent (see notifications/outbox.py). Rows are sent nearest event first, up to the
    daily limit; a row whose event already started is skipped. SENDING = claimed by a run that is sending right now.
    """
    KIND_NEW_EVENT = "NEW_EVENT"
    KIND_EVENT_TOMORROW = "EVENT_TOMORROW"
    KIND_WEEKLY_DONATION = "WEEKLY_DONATION"
    KIND_CHOICES = [
        (KIND_NEW_EVENT, "New event"), (KIND_EVENT_TOMORROW, "Event tomorrow"), (KIND_WEEKLY_DONATION, "Weekly donation reminder"),
    ]

    WAITING = "WAITING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    STATUS_CHOICES = [
        (WAITING, "Waiting"), (SENDING, "Sending"), (SENT, "Sent"), (FAILED, "Failed"), (SKIPPED, "Skipped"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="outbox_emails")
    email = models.CharField(max_length=254)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    event = models.ForeignKey("service.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="outbox_emails")
    subject = models.CharField(max_length=200)
    body = models.TextField(help_text="HTML body (inside the standard Finot email layout).")
    not_after = models.DateTimeField(null=True, blank=True, help_text="Skip instead of send after this moment (the event start).")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=WAITING, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Email outbox"

    def __str__(self):
        return f"{self.get_kind_display()} -> {self.email} ({self.status})"
