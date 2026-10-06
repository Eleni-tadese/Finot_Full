import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator

# Create your models here.


class StudentProfile(models.Model):
    """
    Contains student-specific information.
    Linked to the main User model via OneToOneField.
    """

    IN_CAMPUS = "IN_CAMPUS"
    GRADUATED = "GRADUATED"
    STATUS_CHOICES = [
        (IN_CAMPUS, "In Campus"),
        (GRADUATED, "Graduated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )

    # Personal Info
    profile_image = models.ImageField(
        upload_to="student_profiles/", blank=True, null=True
    )

    # Academic Info
    batch_year = models.IntegerField(blank=True, null=True, help_text="1-5")
    department = models.CharField(max_length=100, blank=True, null=True)

    dorm_block = models.PositiveIntegerField(
        blank=True, null=True, help_text="Block Number"
    )
    dorm_room = models.PositiveIntegerField(
        blank=True, null=True, help_text="Room Number"
    )
    section = models.IntegerField(blank=True, null=True, help_text="Section Number")

    # Contact Info
    telegram_username = models.CharField(max_length=50, blank=True, null=True)
    personal_phone = models.CharField(max_length=15, blank=True, null=True)
    sms_opt_in = models.BooleanField(
        default=False,
        help_text="The student agreed to receive SMS (answer to a private question, new events, weekly donation reminder).",
    )

    # Emergency Contact
    emergency_name = models.CharField(max_length=100, blank=True, null=True)
    emergency_phone = models.CharField(max_length=15, blank=True, null=True)
    emergency_relation = models.CharField(max_length=50, blank=True, null=True)

    # Church/Dorm Info
    home_address = models.CharField(max_length=255, blank=True, null=True)
    previous_church = models.CharField(max_length=150, blank=True, null=True)
    activity_serving = models.CharField(
        max_length=150, blank=True, null=True, help_text="Current church role"
    )
    confession_father = models.CharField(
        max_length=100, blank=True, null=True, help_text="የንስሐ አባት ስም"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=IN_CAMPUS)
    graduated_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user} Profile"


class Department(models.Model):
    """
    The departments a student can pick, kept by the Super Admin. `years` is the length of the program
    (4 or 5 for most), so the yearly rollover knows when a student finishes.
    """

    name = models.CharField(max_length=100, unique=True)
    years = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(3), MaxValueValidator(7)], help_text="Length of the program in years."
    )
    is_active = models.BooleanField(default=True, help_text="Untick to hide it from new choices (existing students keep it).")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.years} years)"


class YearRollover(models.Model):
    """
    One run of "Start new year". `changes` remembers every profile it touched, so the latest run can be undone.
    """

    label = models.CharField(max_length=40, blank=True, help_text="For example 2026/27.")
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    promoted = models.PositiveIntegerField(default=0)
    graduated = models.PositiveIntegerField(default=0)
    skipped = models.PositiveIntegerField(default=0, help_text="Students with no year on record.")
    changes = models.JSONField(default=list)
    undone_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-performed_at"]

    def __str__(self):
        return f"Rollover {self.label or self.performed_at:%Y-%m-%d}"
