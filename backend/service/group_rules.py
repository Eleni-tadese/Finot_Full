"""
Shared rules for editing service groups, used by the REST API (service admins edit their own
group) and the Super Admin console (create / edit / delete / assign admin).
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.models import Role, UserRole
from core.role_rules import check_role_eligibility

from .i18n import clean_translations
from .models import AgeglotSelection, ServiceGroup, ServiceGroupMembership

# A student can be accepted into at most this many service groups.
MAX_GROUPS_PER_STUDENT = 2

MAX_PHOTO_MB = 5
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


def validate_group_photo(image):
    if image is None:
        return image
    if image.size > MAX_PHOTO_MB * 1024 * 1024:
        raise serializers.ValidationError(
            f"The photo is too large ({image.size / (1024 * 1024):.1f} MB). Maximum is {MAX_PHOTO_MB} MB."
        )
    content_type = getattr(image, "content_type", None)
    if content_type and content_type not in ALLOWED_PHOTO_TYPES:
        raise serializers.ValidationError("Use a JPG, PNG or WebP photo.")
    return image


def validate_web_link(value):
    if value and not value.lower().startswith(("http://", "https://")):
        raise serializers.ValidationError("Only http:// and https:// links are allowed.")
    return value


CONTENT_FIELDS = [
    "summary", "description", "activities", "requirements", "commitment",
    "contact_info", "video_url", "photo", "translations",
]


class GroupContentSerializer(serializers.ModelSerializer):
    """What a Service Admin may change about their own group (never the name or the admin)."""

    photo = serializers.ImageField(required=False, allow_null=True)
    translations = serializers.JSONField(required=False)

    class Meta:
        model = ServiceGroup
        fields = CONTENT_FIELDS

    def validate_translations(self, value):
        return clean_translations(value)

    def validate_photo(self, value):
        return validate_group_photo(value)

    def validate_video_url(self, value):
        return validate_web_link(value)


class GroupFullSerializer(GroupContentSerializer):
    """Super Admin: content plus the name."""

    class Meta(GroupContentSerializer.Meta):
        fields = ["name"] + CONTENT_FIELDS

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("The name cannot be empty.")
        clash = ServiceGroup.objects.filter(name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A group with this name already exists.")
        return value


def group_blockers(group):
    """Reasons a group cannot be deleted (it still has students attached)."""
    reasons = []
    members = ServiceGroupMembership.objects.filter(service_group=group).count()
    picks = AgeglotSelection.objects.filter(service_group=group).count()
    if members:
        reasons.append(f"{members} member(s)")
    if picks:
        reasons.append(f"{picks} student choice(s)")
    return reasons


def release_service_admin(user):
    """The Service Admin role belongs to running a group: someone who no longer runs one loses it."""
    if user is None or ServiceGroup.objects.filter(admin=user).exists():
        return
    for link in UserRole.objects.filter(user=user, role__name=Role.SERVICE_ADMIN):
        link.delete()  # one by one so the signals fix is_staff and the Django groups


def assign_group_admin(group, user):
    """
    Make `user` the admin of `group` (or clear it with None). One person runs one group, and only a member of
    that group can run it. Gives the Service Admin role automatically (signals keep staff flags in sync) and takes it
    from the previous admin when that person runs nothing else.
    Raises django ValidationError with a readable message.
    """
    previous = group.admin
    if user is None:
        group.admin = None
        group.save(update_fields=["admin", "updated_at"])
        release_service_admin(previous)
        return group
    check_role_eligibility(user, Role.SERVICE_ADMIN)
    if not ServiceGroupMembership.objects.filter(service_group=group, student=user).exists():
        name = user.get_full_name() or user.username
        raise DjangoValidationError(
            f"{name} is not a member of '{group.name}'. Accept them into the group first (Members), then make them its admin."
        )
    other = ServiceGroup.objects.filter(admin=user).exclude(pk=group.pk).first()
    if other:
        name = user.get_full_name() or user.username
        raise DjangoValidationError(f"{name} already runs '{other.name}'. One person can run one group.")
    group.admin = user
    group.save(update_fields=["admin", "updated_at"])
    UserRole.objects.get_or_create(user=user, role=Role.objects.get_or_create(name=Role.SERVICE_ADMIN)[0])
    if previous is not None and previous.pk != user.pk:
        release_service_admin(previous)
    return group
