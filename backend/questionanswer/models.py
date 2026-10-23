import uuid
from django.db import models
from django.conf import settings

class Question(models.Model):
    """
    Stores anonymous questions for the counseling platform.
    Supports both public (moderated) and private (direct to counselor) modes.
    """
    CAT_ACADEMIC = "Academic"
    CAT_SPIRITUAL = "Spiritual"
    CAT_FAMILY = "Family"
    CAT_PERSONAL = "Personal"
    OTHER = "Other"
    
    CATEGORY_CHOICES = [
        (CAT_ACADEMIC, "Academic"),
        (CAT_SPIRITUAL, "Spiritual"),
        (CAT_FAMILY, "Family"),
        (CAT_PERSONAL, "Personal"),
        (OTHER, "Other"),
    ]

    VISIBILITY_PUBLIC = "PUBLIC"
    VISIBILITY_PRIVATE = "PRIVATE"
    VISIBILITY_CHOICES = [
        (VISIBILITY_PUBLIC, "Public"),
        (VISIBILITY_PRIVATE, "Private"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name="questions"
    )
    
    display_name = models.CharField(max_length=100, help_text="Nickname")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    question_body = models.TextField()
    visibility = models.CharField(
        max_length=10,
        choices=VISIBILITY_CHOICES,
        default=VISIBILITY_PUBLIC,
        db_index=True,
        help_text="PUBLIC = visible after approval. PRIVATE = only asker + counselor.",
    )
    
    is_approved = models.BooleanField(default=False, help_text="Moderation flag")
    anonymous = models.BooleanField(
        default=True, help_text="Private: the counselor sees only the nickname. The Super Admin can always see who asked."
    )
    email_on_answer = models.BooleanField(default=True, help_text="Email the asker when an answer is published (never with the text).")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.display_name} - {self.category}"


class Answer(models.Model):
    """
    Stores answers to approved questions.
    """
    question = models.ForeignKey(
        Question, 
        on_delete=models.CASCADE, 
        related_name="answers"
    )
    
    # The person answering, typically an authorized user (e.g., priest/counselor).
    responder = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True
    )
    
    display_name = models.CharField(max_length=100, help_text="How the answerer appears")
    answer_body = models.TextField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    is_approved = models.BooleanField(default=False, help_text="Moderation flag")


    def __str__(self):
        return f"Answer to {self.question.id} by {self.display_name}"


class TeacherSpecialization(models.Model):
    """
    Which kinds of private questions a QACounselor handles.
    Set by the Super Admin (Django admin); counselors cannot change it themselves.
    """
    ACADEMIC = "ACADEMIC"
    PSYCHOTHERAPIST = "PSYCHOTHERAPIST"
    SOUL_TEACHER = "SOUL_TEACHER"
    FAMILY = "FAMILY"
    OTHER = "OTHER"
    SPECIALIZATION_CHOICES = [
        (ACADEMIC, "Academic"),
        (SOUL_TEACHER, "Spiritual (soul teacher)"),
        (FAMILY, "Family"),
        (PSYCHOTHERAPIST, "Personal (psychotherapist)"),
        (OTHER, "Other"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="qa_specializations"
    )
    specialization = models.CharField(max_length=20, choices=SPECIALIZATION_CHOICES)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "specialization"], name="unique_user_specialization")
        ]

    def __str__(self):
        return f"{self.user} - {self.get_specialization_display()}"


class PrivateQuestionAssignment(models.Model):
    """
    Admin assigns a private question to specific counselor(s).
    A question with at least one assignment is visible ONLY to its assigned counselors
    (and the Super Admin). Questions that need psychotherapy are never visible to
    counselors without an assignment.
    """
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="assignments")
    counselor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="qa_assignments"
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["question", "counselor"], name="unique_question_counselor")
        ]

    def __str__(self):
        return f"{self.question_id} -> {self.counselor}"
