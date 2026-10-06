"""
Who may see which private question.

Category -> specialization mapping (private questions only):
    Academic  -> ACADEMIC
    Spiritual -> SOUL_TEACHER
    Personal  -> PSYCHOTHERAPIST   (sensitive: only visible once an admin assigns it)
    Family    -> FAMILY
    Other     -> OTHER

Rules for a QACounselor:
  1. A question assigned to them is visible to them.
  2. A question assigned to someone else is NOT visible to them.
  3. An unassigned, non-sensitive question is visible if the counselor has the
     specialization that matches its category.
Super Admin sees every private question. Moderators and everyone else see none
(askers see their own through the private inbox).
"""
from django.db.models import Q

from core.models import Role

from .models import Question, TeacherSpecialization

CATEGORY_SPECIALIZATION = {
    Question.CAT_ACADEMIC: TeacherSpecialization.ACADEMIC,
    Question.CAT_SPIRITUAL: TeacherSpecialization.SOUL_TEACHER,
    Question.CAT_PERSONAL: TeacherSpecialization.PSYCHOTHERAPIST,
    Question.CAT_FAMILY: TeacherSpecialization.FAMILY,
    Question.OTHER: TeacherSpecialization.OTHER,
}
SENSITIVE_SPECIALIZATIONS = {TeacherSpecialization.PSYCHOTHERAPIST}


def specialization_for(category):
    """Specialization label for a question category, or None when any counselor may take it."""
    return CATEGORY_SPECIALIZATION.get(category)


def is_super_admin(user):
    return user.is_superuser or user.roles.filter(name=Role.SUPER_ADMIN).exists()


def is_counselor(user):
    return user.roles.filter(name=Role.QA_COUNSELOR).exists()


def private_questions_for(user):
    """Private questions this user may read/answer as staff (not as the asker)."""
    private = Question.objects.filter(visibility=Question.VISIBILITY_PRIVATE)
    if not (user and user.is_authenticated):
        return private.none()
    if is_super_admin(user):
        return private
    if not is_counselor(user):
        return private.none()

    mine = Q(assignments__counselor=user)
    my_specs = set(user.qa_specializations.values_list("specialization", flat=True))
    open_categories = [
        category
        for category in dict(Question.CATEGORY_CHOICES)
        if (spec := specialization_for(category)) is None
        or (spec in my_specs and spec not in SENSITIVE_SPECIALIZATIONS)
    ]
    unassigned_and_open = Q(assignments__isnull=True, category__in=open_categories)
    visible_ids = (
        private.filter(mine | unassigned_and_open).values_list("pk", flat=True).distinct()
    )
    return private.filter(pk__in=list(visible_ids))


def can_access_private_question(user, question):
    return private_questions_for(user).filter(pk=question.pk).exists()
