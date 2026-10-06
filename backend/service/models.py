from django.db import models
from django.conf import settings


class ServiceConfiguration(models.Model):
    """
    Singleton model to control global service settings.
    """

    is_selection_open = models.BooleanField(
        default=False, help_text="Open service group selection for students"
    )

    def save(self, *args, **kwargs):
        # Hardcode the PK to 1 to enforce a true singleton.
        # Every call is an UPSERT on the same row — no race condition possible.
        self.pk = 1
        return super(ServiceConfiguration, self).save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Prevent deletion so the configuration row always exists.
        pass

    def __str__(self):
        return "Service Configuration"

    class Meta:
        verbose_name_plural = "Service Configuration"


class ServiceGroup(models.Model):
    """
    Master table for church service groups (Ageglot).
    e.g., Choir, Finance, Charity.
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)

    # Information that helps students choose a group. Filled in by the Super Admin
    # and by the group's own Service Admin.
    summary = models.CharField(
        max_length=200, blank=True, help_text="One sentence shown on the group card."
    )
    activities = models.TextField(
        blank=True, help_text="What members do. One activity per line."
    )
    requirements = models.TextField(
        blank=True, help_text="Who should join: skills, interests or conditions."
    )
    commitment = models.CharField(
        max_length=255, blank=True, help_text="Time commitment and when/where the group meets."
    )
    contact_info = models.CharField(
        max_length=255, blank=True, help_text="How a student can ask questions (name, phone, Telegram)."
    )
    photo = models.ImageField(upload_to="service_groups/", blank=True, null=True)
    video_url = models.URLField(
        max_length=500, blank=True, help_text="Optional video (YouTube or any web link)."
    )
    translations = models.JSONField(
        default=dict, blank=True,
        help_text='Amharic / Oromo versions of the text: {"am": {"name": "..."}, "om": {...}}. Empty fields use the main text.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    # Admin responsible for this group
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_service_groups",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ServiceGroupMembership(models.Model):
    """
    Tracks ACTUAL approved membership in a service group.
    A student can belong to a few groups (the limit is MAX_GROUPS_PER_STUDENT in group_rules.py), once each.
    """

    MEMBER = "MEMBER"
    LEADER = "LEADER"
    COORDINATOR = "COORDINATOR"

    ROLE_CHOICES = [
        (MEMBER, "Member"),
        (LEADER, "Leader"),
        (COORDINATOR, "Coordinator"),
    ]

    ACTIVE = "ACTIVE"
    PROBATION = "PROBATION"
    INACTIVE = "INACTIVE"  # e.g. Took a break

    STATUS_CHOICES = [
        (ACTIVE, "Active"),
        (PROBATION, "Probation"),
        (INACTIVE, "Inactive"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="service_memberships",
    )

    service_group = models.ForeignKey(
        ServiceGroup, on_delete=models.CASCADE, related_name="members"
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=MEMBER)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=ACTIVE)

    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "service_group"], name="unique_student_per_service_group"),
        ]

    def __str__(self):
        return f"{self.student} -> {self.service_group} ({self.role})"


class Event(models.Model):
    """
    Stores system-wide events created by admins.
    """

    UPCOMING = "UPCOMING"
    ONGOING = "ONGOING"
    COMPLETED = "COMPLETED"

    STATUS_CHOICES = [
        (UPCOMING, "Upcoming"),
        (ONGOING, "Ongoing"),
        (COMPLETED, "Completed"),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField()
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    photo = models.ImageField(upload_to="events/", blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=UPCOMING)  # legacy: use current_status

    @property
    def current_status(self):
        """UPCOMING before the start, ONGOING until the end, COMPLETED after it."""
        from django.utils import timezone

        now = timezone.now()
        if now < self.start_date:
            return self.UPCOMING
        if now <= self.end_date:
            return self.ONGOING
        return self.COMPLETED

    # Adding Location Data
    place_name = models.CharField(max_length=255, blank=True, null=True)
    place_url = models.URLField(
        max_length=500, blank=True, null=True, help_text="Google Maps URL"
    )

    # Adding Service Group Isolation
    service_group = models.ForeignKey(
        ServiceGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="events",
        help_text="If blank, this is a general system-wide event. If set, it's specific to this service group.",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_events",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class ServiceAttendance(models.Model):
    """
    Tracks attendance for events.
    """

    PRESENT = "PRESENT"
    ABSENT = "ABSENT"

    STATUS_CHOICES = [
        (PRESENT, "Present"),
        (ABSENT, "Absent"),
    ]

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="attendances"
    )

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="service_attendances",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PRESENT)

    remark = models.CharField(max_length=255, blank=True, null=True)

    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["event", "student"]
        ordering = ["-event__start_date", "student"]

    def __str__(self):
        return f"{self.student} @ {self.event}: {self.status}"


class AgeglotSelection(models.Model):
    """
    Stores student service preferences with priority ranking.
    """

    PRIORITY_CHOICES = [
        (1, "First Choice"),
        (2, "Second Choice"),
        (3, "Third Choice"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="service_selections",
    )
    service_group = models.ForeignKey(
        ServiceGroup, on_delete=models.CASCADE, related_name="selections"
    )
    priority = models.IntegerField(choices=PRIORITY_CHOICES)
    skills = models.TextField(
        blank=True, null=True, help_text="Relevant talents/skills"
    )
    reason = models.TextField(blank=True, null=True, help_text="Reason for selection")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["student", "priority"]
        unique_together = [
            # A student generally shouldn't pick the same priority twice
            ("student", "priority"),
            # A student shouldn't pick the same service twice
            ("student", "service_group"),
        ]

    def __str__(self):
        return f"{self.student} - {self.service_group} ({self.priority})"


class Family(models.Model):
    """
    Groups students under senior mentorship (Family structure).
    """

    MALE = "M"
    FEMALE = "F"
    GENDER_CHOICES = [
        (MALE, "Male"),
        (FEMALE, "Female"),
    ]

    name = models.CharField(max_length=100, unique=True)
    gender = models.CharField(
        max_length=1,
        choices=GENDER_CHOICES,
        blank=True,
        null=True,
        help_text="Determines whether this family accepts male or female students. Leave blank for mixed.",
    )

    # Enforce that one user leads only ONE family
    father = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_family_as_father",
        limit_choices_to={"gender": "M"},
    )

    mother = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_family_as_mother",
        limit_choices_to={"gender": "F"},
    )

    religious_father = models.CharField(max_length=150, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Families"

    def __str__(self):
        return self.name


class FamilyDistributionBatch(models.Model):
    """
    One confirmed run of the smart family distribution. Lets an admin undo the whole run.
    """

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    undone_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Family distribution batches"

    def __str__(self):
        return f"Distribution {self.created_at:%Y-%m-%d %H:%M}"


class FamilyMembership(models.Model):
    """
    Links students to a specific family.
    """

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="members")

    # OneToOne ensures a student is only in ONE family at a time
    student = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="family_membership",
    )

    joined_at = models.DateTimeField(auto_now_add=True)

    # Set when the membership was created by the smart distribution (used for undo)
    batch = models.ForeignKey(
        FamilyDistributionBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="memberships",
    )

    def __str__(self):
        return f"{self.student} -> {self.family.name}"


class FamilyMessage(models.Model):
    """
    A message from a father or mother to the whole family (recipient empty) or to one child.
    """

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="family_messages_sent"
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="family_messages_received"
    )
    body = models.TextField(max_length=1000)
    # A child's reply: only the father and mother read it, not the brothers and sisters
    parents_only = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.family.name}: {self.body[:30]}"
