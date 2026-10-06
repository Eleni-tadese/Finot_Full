"""
Super Admin console API (used by the React "Admin" area).

Everything here is Super Admin only. Mounted at /api/admin-console/.

    GET   overview/
    GET   roles/
    GET   users/?search=&role=&status=&gender=&batch=&department=&group=&family=&dorm_block=&section=&page=
    GET   users/filters/                        PATCH users/<id>/  {is_active?, roles?}
    GET   sub-admins/                           PUT   service-groups/<id>/admin/
    GET   qa/counselors/                        PUT   qa/counselors/<id>/specializations/
    GET   families/distribution/                POST  families/distribution/preview/
    POST  families/distribution/confirm/        POST  families/distribution/batches/<id>/undo/
    GET   sms/settings/                         PATCH sms/settings/
    GET   sms/logs/?status=&page=
"""
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Role, UserRole
from notifications.models import SMSConfiguration, SMSLog
from questionanswer.models import Question, TeacherSpecialization
from questionanswer.visibility import is_super_admin, specialization_for, SENSITIVE_SPECIALIZATIONS
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from service.group_rules import GroupFullSerializer, assign_group_admin, group_blockers, release_service_admin
from service.models import Event, Family, FamilyDistributionBatch, ServiceGroup
from service.services import build_auto_distribution_plan
from service.services import (
    MAX_FAMILY_SIZE, apply_distribution, build_distribution_plan, get_filter_options,
    get_unassigned_freshers, undo_distribution,
)
from core.role_rules import MIN_YEAR, check_family_leader, check_role_eligibility
from student import rollover
from student.cards import profile_card
from student.models import Department, StudentProfile, YearRollover

User = get_user_model()


class IsSuperAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and is_super_admin(request.user))


class ConsoleView(APIView):
    permission_classes = [IsSuperAdminUser]


class IsSuperAdminOrFamilyAdmin(permissions.BasePermission):
    """Families are run by the Super Admin and by people holding the Family Admin role."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return is_super_admin(user) or user.roles.filter(name=Role.FAMILY_ADMIN).exists()


class FamilyConsoleView(APIView):
    permission_classes = [IsSuperAdminOrFamilyAdmin]


class ConsolePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def full_name(user):
    return " ".join(p for p in (user.first_name, user.middle_name, user.last_name) if p) or user.username


# ── Overview ────────────────────────────────────────────────────────────────

class OverviewView(ConsoleView):
    @staticmethod
    def _donations():
        from donation.models import Payment
        from donation.reports import payments_for, summary

        s = summary(payments_for({}))
        return {"collected": s["collected"], "completed": s["completed"], "pending": s["pending"], "failed": s["failed"]}

    def get(self, request):
        config = SMSConfiguration.get()
        private = Question.objects.filter(visibility=Question.VISIBILITY_PRIVATE)
        sensitive_categories = [
            c for c in dict(Question.CATEGORY_CHOICES) if specialization_for(c) in SENSITIVE_SPECIALIZATIONS
        ]
        by_role = dict(
            UserRole.objects.values_list("role__name").annotate(n=Count("id")).order_by("role__name")
        )
        return Response({
            "users": {
                "total": User.objects.count(),
                "active": User.objects.filter(is_active=True).count(),
                "students": StudentProfile.objects.count(),
                "by_role": by_role,
            },
            "events": {
                "upcoming": Event.objects.filter(start_date__gt=timezone.now()).count(),
                "total": Event.objects.count(),
            },
            "donations": self._donations(),
            "families": {
                "total": Family.objects.count(),
                "unassigned_freshers": get_unassigned_freshers().count(),
            },
            "qa": {
                "public_pending": Question.objects.filter(
                    visibility=Question.VISIBILITY_PUBLIC, is_approved=False
                ).count(),
                "private_total": private.count(),
                "private_unanswered": private.filter(answers__isnull=True).count(),
                "needs_assignment": private.filter(
                    category__in=sensitive_categories, assignments__isnull=True
                ).count(),
            },
            "sms": {
                "enabled": config.enabled,
                "monthly_limit": config.monthly_limit,
                "sent_this_month": config.sent_this_month(),
            },
        })


# ── Users & roles ───────────────────────────────────────────────────────────

def serialize_user(user):
    profile = getattr(user, "student_profile", None)
    memberships = list(user.service_memberships.all()) if hasattr(user, "service_memberships") else []
    group_names = [m.service_group.name for m in memberships]
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": full_name(user),
        "is_active": user.is_active,
        "gender": user.gender,
        "batch_year": profile.batch_year if profile else None,
        "department": (profile.department or "") if profile else "",
        "dorm_block": profile.dorm_block if profile else None,
        "section": profile.section if profile else None,
        "service_group": ", ".join(group_names) or None,
        "service_groups": group_names,
        "student_status": profile.status if profile else None,
        "roles": sorted(r.role.name for r in user.userrole_set.all()) if hasattr(user, "userrole_set") else [],
        "date_joined": user.date_joined,
    }


class RolesView(ConsoleView):
    def get(self, request):
        return Response([
            {"name": value, "label": label, "min_year": MIN_YEAR.get(value), "via_group": value == Role.SERVICE_ADMIN}
            for value, label in Role.ROLE_CHOICES
        ])


def _int_param(request, name):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except ValueError:
        raise ValidationError({name: "Must be a number."})


def filter_users(request, qs):
    """The filters shared by the Users list: who they are (profile), where they serve, and their status."""
    p = request.query_params
    search = p.get("search", "").strip()
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(middle_name__icontains=search)
            | Q(email__icontains=search) | Q(username__icontains=search)
        )
    if p.get("role"):
        qs = qs.filter(roles__name=p["role"])
    if p.get("status") == "active":
        qs = qs.filter(is_active=True)
    elif p.get("status") == "inactive":
        qs = qs.filter(is_active=False)
    if p.get("stage") == "student":
        qs = qs.filter(student_profile__status=StudentProfile.IN_CAMPUS)
    elif p.get("stage") == "graduated":
        qs = qs.filter(student_profile__status=StudentProfile.GRADUATED)
    if p.get("gender") in ("M", "F"):
        qs = qs.filter(gender=p["gender"])
    batch = _int_param(request, "batch")
    if batch is not None:
        qs = qs.filter(student_profile__batch_year=batch)
    if p.get("department"):
        qs = qs.filter(student_profile__department__iexact=p["department"].strip())
    block = _int_param(request, "dorm_block")
    if block is not None:
        qs = qs.filter(student_profile__dorm_block=block)
    section = _int_param(request, "section")
    if section is not None:
        qs = qs.filter(student_profile__section=section)
    group = p.get("group")
    if group == "none":
        qs = qs.filter(service_memberships__isnull=True)
    elif group:
        qs = qs.filter(service_memberships__service_group_id=_int_param(request, "group"))
    family = p.get("family")
    if family == "none":
        qs = qs.filter(family_membership__isnull=True)
    elif family == "has":
        qs = qs.filter(family_membership__isnull=False)
    return qs


class UserFilterOptionsView(ConsoleView):
    """Values that actually exist, so the filter dropdowns only offer choices that match someone."""

    def get(self, request):
        profiles = StudentProfile.objects
        departments = {}
        for value in profiles.exclude(department__isnull=True).exclude(department="").values_list("department", flat=True):
            departments.setdefault(value.strip().lower(), value.strip())
        return Response({
            "batches": sorted(profiles.exclude(batch_year__isnull=True).values_list("batch_year", flat=True).distinct()),
            "departments": sorted(departments.values(), key=str.lower),
            "dorm_blocks": sorted(profiles.exclude(dorm_block__isnull=True).values_list("dorm_block", flat=True).distinct()),
            "sections": sorted(profiles.exclude(section__isnull=True).values_list("section", flat=True).distinct()),
            "groups": [{"id": g.id, "name": g.name} for g in ServiceGroup.objects.order_by("name")],
        })


class DonationsView(ConsoleView):
    """GET donations/?status=&fund=&kind=&search=&date_from=&date_to=&page=  rows + totals for the whole filter."""

    def get(self, request):
        from donation.reports import payments_for, row, summary

        qs = payments_for(request.query_params)
        paginator = ConsolePagination()
        page = paginator.paginate_queryset(qs, request)
        response = paginator.get_paginated_response([row(p) for p in page])
        response.data["summary"] = summary(qs)
        return response


class DonationsRecheckView(ConsoleView):
    """POST donations/recheck/ : ask Chapa now about every pending payment (no waiting time)."""

    def post(self, request):
        from datetime import timedelta

        from donation.settle import recheck_pending_payments

        return Response(recheck_pending_payments(min_age=timedelta(0)))


class UsersView(ConsoleView):
    def get(self, request):
        qs = (
            User.objects.all()
            .select_related("student_profile")
            .prefetch_related("userrole_set__role", "service_memberships__service_group")
            .order_by("first_name", "last_name", "id")
        )
        qs = filter_users(request, qs)
        paginator = ConsolePagination()
        page = paginator.paginate_queryset(qs.distinct(), request)
        return paginator.get_paginated_response([serialize_user(u) for u in page])


def _apply_profile_facts(user, data):
    """Year, department and stage of one person; the Super Admin is the only one who may change them after sign-up."""
    if not any(k in data for k in ("batch_year", "department", "student_status")):
        return
    profile, _ = StudentProfile.objects.get_or_create(user=user)
    if "batch_year" in data:
        raw = data["batch_year"]
        if raw in (None, ""):
            profile.batch_year = None
        else:
            try:
                year = int(raw)
            except (TypeError, ValueError):
                raise ValidationError({"batch_year": "Must be a number."})
            if not 1 <= year <= 7:
                raise ValidationError({"batch_year": "The year must be between 1 and 7."})
            profile.batch_year = year
    if "department" in data:
        name = str(data["department"] or "").strip()
        if not name:
            profile.department = None
        else:
            match = Department.objects.filter(name__iexact=name).first()
            if match is None and Department.objects.filter(is_active=True).exists():
                raise ValidationError({"department": "Choose a department from the list."})
            profile.department = match.name if match else name
    if "student_status" in data:
        if data["student_status"] not in (StudentProfile.IN_CAMPUS, StudentProfile.GRADUATED):
            raise ValidationError({"student_status": "Must be IN_CAMPUS or GRADUATED."})
        if data["student_status"] == StudentProfile.GRADUATED and profile.status != StudentProfile.GRADUATED:
            profile.graduated_at = timezone.now()
        if data["student_status"] == StudentProfile.IN_CAMPUS:
            profile.graduated_at = None
        profile.status = data["student_status"]
    dept = Department.objects.filter(name__iexact=profile.department or "").first() if profile.department else None
    if dept and profile.batch_year and profile.batch_year > dept.years:
        raise ValidationError({"batch_year": f"{dept.name} is a {dept.years}-year program."})
    profile.save()


class UserDetailView(ConsoleView):
    def get(self, request, pk):
        """Everything about one person (Super Admin only)."""
        user = (
            User.objects.select_related("student_profile", "family_membership__family")
            .prefetch_related("service_memberships__service_group")
            .filter(pk=pk).first()
        )
        if user is None:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(profile_card(user, full=True))

    @transaction.atomic
    def patch(self, request, pk):
        try:
            user = User.objects.prefetch_related("userrole_set__role").get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if "is_active" in request.data:
            active = request.data["is_active"]
            if not isinstance(active, bool):
                raise ValidationError({"is_active": "Must be true or false."})
            if user.pk == request.user.pk and not active:
                raise ValidationError({"is_active": "You cannot deactivate your own account."})
            user.is_active = active
            user.save(update_fields=["is_active"])

        _apply_profile_facts(user, request.data)
        user = User.objects.prefetch_related("userrole_set__role").get(pk=pk)

        # "roles" replaces the whole list; "add_role" / "remove_role" change just one role
        roles_payload = request.data.get("roles")
        if roles_payload is None and ("add_role" in request.data or "remove_role" in request.data):
            held = {ur.role.name for ur in user.userrole_set.all()}
            if request.data.get("add_role"):
                held.add(request.data["add_role"])
            if request.data.get("remove_role"):
                held.discard(request.data["remove_role"])
            roles_payload = sorted(held)

        if roles_payload is not None:
            names = roles_payload
            valid = {v for v, _ in Role.ROLE_CHOICES}
            if not isinstance(names, list) or not set(names) <= valid:
                raise ValidationError({"roles": f"Must be a list of: {', '.join(sorted(valid))}."})
            names = set(names)
            current = {ur.role.name for ur in user.userrole_set.all()}
            if Role.SUPER_ADMIN in current and Role.SUPER_ADMIN not in names:
                if user.pk == request.user.pk:
                    raise ValidationError({"roles": "You cannot remove your own Super Admin role."})
                if UserRole.objects.filter(role__name=Role.SUPER_ADMIN).exclude(user=user).count() == 0:
                    raise ValidationError({"roles": "At least one Super Admin must remain."})
            # Removing / adding rows fires the existing signals that keep Django groups,
            # is_staff and is_superuser in sync.
            if Role.SERVICE_ADMIN in names - current:
                raise ValidationError({
                    "roles": "Service Admin is given by making the person the admin of a group they belong to (Service groups).",
                })
            for name in names - current:
                try:
                    check_role_eligibility(user, name)
                except DjangoValidationError as exc:
                    raise ValidationError({"roles": exc.messages[0]})
            for ur in user.userrole_set.exclude(role__name__in=names):
                if ur.role.name == Role.SERVICE_ADMIN:
                    ServiceGroup.objects.filter(admin=user).update(admin=None)  # no role, no group to run
                ur.delete()
            for name in names - current:
                UserRole.objects.create(user=user, role=Role.objects.get_or_create(name=name)[0])

        user = User.objects.prefetch_related("userrole_set__role").get(pk=pk)
        return Response(serialize_user(user))


# ── Sub-admins (everyone who holds an admin-type role) ──────────────────────

ROLE_DESCRIPTIONS = {
    Role.SUPER_ADMIN: "Full access to everything, including this console.",
    Role.SERVICE_ADMIN: "Runs one service group: its members, events, attendance and materials.",
    Role.FAMILY_ADMIN: "Helps manage families.",
    Role.EVENT_MANAGER: "Creates and manages their own events.",
    Role.COURSE_COORDINATOR: "Manages courses: sessions, attendance, reports and materials.",
    Role.QA_COUNSELOR: "Answers private questions that match their specialization or are assigned to them.",
    Role.QA_MODERATOR: "Approves public questions and answers.",
}


class SubAdminsView(ConsoleView):
    def get(self, request):
        result = []
        for name, label in Role.ROLE_CHOICES:
            if name == Role.STUDENT:
                continue
            users = (
                User.objects.filter(roles__name=name)
                .prefetch_related("managed_service_groups", "qa_specializations", "coordinating_semester_courses")
                .order_by("first_name", "last_name")
            )
            members = []
            for u in users:
                detail = ""
                if name == Role.SERVICE_ADMIN:
                    groups = [g.name for g in u.managed_service_groups.all()]
                    detail = ", ".join(groups) if groups else "No group yet"
                elif name == Role.QA_COUNSELOR:
                    specs = dict(TeacherSpecialization.SPECIALIZATION_CHOICES)
                    detail = ", ".join(specs[s.specialization] for s in u.qa_specializations.all()) or "No specialization yet"
                elif name == Role.COURSE_COORDINATOR:
                    detail = f"{u.coordinating_semester_courses.count()} course(s)"
                members.append({
                    "id": u.id, "full_name": full_name(u), "email": u.email,
                    "is_active": u.is_active, "detail": detail,
                })
            result.append({
                "name": name, "label": label, "description": ROLE_DESCRIPTIONS.get(name, ""),
                "min_year": MIN_YEAR.get(name), "members": members,
            })
        return Response(result)


def _group_json(g):
    return {
        "id": g.id, "name": g.name, "summary": g.summary, "description": g.description or "",
        "activities": g.activities, "requirements": g.requirements, "commitment": g.commitment,
        "contact_info": g.contact_info, "photo": g.photo.url if g.photo else None, "video_url": g.video_url,
        "translations": g.translations or {},
        "admin": {"id": g.admin_id, "full_name": full_name(g.admin), "email": g.admin.email} if g.admin else None,
        "member_count": getattr(g, "member_count_db", None),
        "updated_at": g.updated_at,
    }


def _groups_queryset():
    return (
        ServiceGroup.objects.select_related("admin")
        .annotate(member_count_db=Count("members", filter=Q(members__status="ACTIVE")))
        .order_by("name")
    )


def _set_admin(group, raw):
    """Set (or clear, when raw is empty) the group's admin; shared by create, edit and the quick-assign endpoint."""
    if raw in (None, "", "null"):
        assign_group_admin(group, None)
        return
    try:
        user_id = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"admin_id": "Must be a user id or empty."})
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        raise ValidationError({"admin_id": "User not found or not active."})
    try:
        assign_group_admin(group, user)
    except DjangoValidationError as exc:
        raise ValidationError({"admin_id": exc.messages[0]})


def _apply_admin_field(request, group):
    if "admin_id" in request.data:
        _set_admin(group, request.data.get("admin_id"))


class ServiceGroupsView(ConsoleView):
    def get(self, request):
        return Response([_group_json(g) for g in _groups_queryset()])

    def post(self, request):
        """Create a group. Body (JSON or multipart): name, content fields, optional admin_id."""
        serializer = GroupFullSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            group = serializer.save()
            _apply_admin_field(request, group)
        return Response(_group_json(_groups_queryset().get(pk=group.pk)), status=status.HTTP_201_CREATED)


class ServiceGroupDetailView(ConsoleView):
    def patch(self, request, pk):
        group = ServiceGroup.objects.filter(pk=pk).first()
        if group is None:
            return Response({"detail": "Service group not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = GroupFullSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
            _apply_admin_field(request, group)
        return Response(_group_json(_groups_queryset().get(pk=group.pk)))

    def delete(self, request, pk):
        group = ServiceGroup.objects.filter(pk=pk).first()
        if group is None:
            return Response({"detail": "Service group not found."}, status=status.HTTP_404_NOT_FOUND)
        blockers = group_blockers(group)
        if blockers:
            raise ValidationError({"detail": f"This group still has {' and '.join(blockers)}. Move or remove them first."})
        previous_admin = group.admin
        group.delete()
        release_service_admin(previous_admin)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceGroupAdminView(ConsoleView):
    def put(self, request, pk):
        group = ServiceGroup.objects.filter(pk=pk).first()
        if group is None:
            return Response({"detail": "Service group not found."}, status=status.HTTP_404_NOT_FOUND)
        if "user_id" not in request.data:
            raise ValidationError({"user_id": "Required (a user id or null)."})
        user_id = request.data["user_id"]
        if user_id is not None and (isinstance(user_id, bool) or not isinstance(user_id, int)):
            raise ValidationError({"user_id": "Must be a user id or null."})
        _set_admin(group, user_id)
        group.refresh_from_db()
        admin = group.admin
        return Response({"id": group.id, "admin": {"id": admin.id, "full_name": full_name(admin)} if admin else None})


# ── Private Q&A: counselors and specializations ─────────────────────────────

class CounselorsView(ConsoleView):
    def get(self, request):
        counselors = (
            User.objects.filter(roles__name=Role.QA_COUNSELOR)
            .prefetch_related("qa_specializations")
            .annotate(assigned_count=Count("qa_assignments", distinct=True))
            .order_by("first_name", "last_name")
        )
        return Response([
            {
                "id": c.id,
                "full_name": full_name(c),
                "email": c.email,
                "specializations": sorted(s.specialization for s in c.qa_specializations.all()),
                "assigned_count": c.assigned_count,
            }
            for c in counselors
        ])


class CounselorSpecializationsView(ConsoleView):
    def put(self, request, pk):
        counselor = User.objects.filter(pk=pk, roles__name=Role.QA_COUNSELOR).first()
        if counselor is None:
            return Response({"detail": "Counselor not found."}, status=status.HTTP_404_NOT_FOUND)
        values = request.data.get("specializations")
        valid = {v for v, _ in TeacherSpecialization.SPECIALIZATION_CHOICES}
        if not isinstance(values, list) or not set(values) <= valid:
            raise ValidationError({"specializations": f"Must be a list of: {', '.join(sorted(valid))}."})
        counselor.qa_specializations.exclude(specialization__in=values).delete()
        for value in set(values):
            TeacherSpecialization.objects.get_or_create(user=counselor, specialization=value)
        return Response({"id": counselor.id, "specializations": sorted(set(values))})


# ── Group selection window ──────────────────────────────────────────────────

class ServiceConfigView(ConsoleView):
    """Open or close the period in which students may choose their service groups."""

    def get(self, request):
        from service.models import ServiceConfiguration
        config = ServiceConfiguration.objects.first()
        return Response({"is_selection_open": bool(config and config.is_selection_open)})

    def patch(self, request):
        from service.models import ServiceConfiguration
        value = request.data.get("is_selection_open")
        if not isinstance(value, bool):
            raise ValidationError({"is_selection_open": "Must be true or false."})
        config = ServiceConfiguration.objects.first() or ServiceConfiguration()
        config.is_selection_open = value
        config.save()
        return Response({"is_selection_open": config.is_selection_open})


# ── Families ────────────────────────────────────────────────────────────────

class FamilyPeopleView(FamilyConsoleView):
    """GET families/people/?search= : name and email of active people, so a father or mother can be picked.
    Deliberately small: a Family Admin must not see the full user list (phones, roles, groups)."""

    def get(self, request):
        term = request.query_params.get("search", "").strip()
        if len(term) < 2:
            return Response({"results": []})
        qs = User.objects.filter(is_active=True).filter(
            Q(first_name__icontains=term) | Q(middle_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term)
        ).order_by("first_name", "last_name", "id")[:20]
        return Response({"results": [
            {"id": u.id, "full_name": full_name(u), "email": u.email, "is_active": True, "gender": u.gender} for u in qs
        ]})


class FamiliesView(FamilyConsoleView):
    def post(self, request):
        """
        Create a family. Body: name, gender ("M" / "F" / empty = mixed), optional father_id (a man),
        mother_id (a woman) and religious_father. One person can lead only one family.
        """
        name = str(request.data.get("name", "")).strip()
        if not name:
            raise ValidationError({"name": "Give the family a name."})
        if len(name) > 100:
            raise ValidationError({"name": "The name is too long (maximum 100)."})
        if Family.objects.filter(name__iexact=name).exists():
            raise ValidationError({"name": "A family with this name already exists."})
        gender = request.data.get("gender") or None
        if gender not in (None, "M", "F"):
            raise ValidationError({"gender": "Must be M, F or empty."})

        def parent(key, expected_gender, label):
            raw = request.data.get(key)
            if raw in (None, ""):
                return None
            try:
                person = User.objects.get(pk=int(raw), is_active=True)
            except (TypeError, ValueError, User.DoesNotExist):
                raise ValidationError({key: "User not found or not active."})
            if person.gender != expected_gender:
                raise ValidationError({key: f"The {label} must be a {'man' if expected_gender == 'M' else 'woman'}."})
            try:
                check_family_leader(person)
            except DjangoValidationError as exc:
                raise ValidationError({key: exc.messages[0]})
            if Family.objects.filter(**{key.replace("_id", ""): person}).exists():
                raise ValidationError({key: f"{full_name(person)} already leads a family."})
            return person

        father = parent("father_id", "M", "father")
        mother = parent("mother_id", "F", "mother")
        family = Family.objects.create(
            name=name, gender=gender, father=father, mother=mother,
            religious_father=str(request.data.get("religious_father", "")).strip()[:150],
        )
        return Response({"id": family.id, "name": family.name}, status=status.HTTP_201_CREATED)


# ── Family distribution ─────────────────────────────────────────────────────

def _batch_json(batch):
    return {
        "id": batch.id,
        "created_at": batch.created_at,
        "created_by": full_name(batch.created_by) if batch.created_by else None,
        "student_count": batch.memberships.count(),
        "undone_at": batch.undone_at,
    }


class DistributionOverviewView(FamilyConsoleView):
    def get(self, request):
        families = Family.objects.annotate(member_count=Count("members")).order_by("name")
        return Response({
            "limit": MAX_FAMILY_SIZE,
            "unassigned_count": get_unassigned_freshers().count(),
            "filter_options": get_filter_options(),
            "families": [
                {"id": f.id, "name": f.name, "gender": f.gender, "member_count": f.member_count}
                for f in families
            ],
            "batches": [_batch_json(b) for b in FamilyDistributionBatch.objects.select_related("created_by")[:10]],
        })


class DistributionPreviewView(FamilyConsoleView):
    def post(self, request):
        data = request.data
        family_ids = data.get("family_ids")
        if not isinstance(family_ids, list) or not family_ids or not all(isinstance(i, int) for i in family_ids):
            raise ValidationError({"family_ids": "Choose at least one family."})

        def optional_int(key):
            value = data.get(key)
            if value in (None, ""):
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                raise ValidationError({key: "Must be a number."})

        gender = data.get("gender") or None
        if gender not in (None, "M", "F"):
            raise ValidationError({"gender": "Must be M or F."})
        students = get_unassigned_freshers(
            gender=gender, dorm_block=optional_int("dorm_block"), section=optional_int("section"),
        )
        families = Family.objects.filter(pk__in=family_ids).order_by("name")
        plan, family_map, _ = build_distribution_plan(students, families)
        rows, pairs = [], []
        for family_id, members in plan.assignments.items():
            family = family_map[family_id]
            current = family.members.count()
            rows.append({
                "family_id": family.id, "family_name": family.name, "current": current,
                "after": current + len(members),
                "added": [
                    {"id": s.id, "name": s.name, "dorm_block": s.dorm_block, "section": s.section} for s in members
                ],
            })
            pairs.extend([s.id, family_id] for s in members)
        return Response({
            "rows": rows,
            "pairs": pairs,
            "total_added": len(pairs),
            "unplaced": [{"id": s.id, "name": s.name, "reason": reason} for s, reason in plan.unplaced],
            "limit": MAX_FAMILY_SIZE,
        })


class DistributionAutoPreviewView(FamilyConsoleView):
    """POST families/distribution/auto-preview/ : the system plans the families too (nothing is saved)."""

    def post(self, request):
        plan, family_map, new_families = build_auto_distribution_plan(get_unassigned_freshers())
        new_by_id = {f["temp_id"]: f for f in new_families}
        rows, pairs = [], []
        for family_id, members in plan.assignments.items():
            if family_id in new_by_id:
                name, current = new_by_id[family_id]["name"], 0
            else:
                name, current = family_map[family_id].name, family_map[family_id].members.count()
            rows.append({
                "family_id": family_id, "family_name": name, "current": current,
                "after": current + len(members), "is_new": family_id in new_by_id,
                "female": sum(1 for s in members if s.gender == "F"),
                "male": sum(1 for s in members if s.gender == "M"),
                "added": [
                    {"id": s.id, "name": s.name, "dorm_block": s.dorm_block, "section": s.section} for s in members
                ],
            })
            pairs.extend([s.id, family_id] for s in members)
        used = {r["family_id"] for r in rows if r["is_new"] and r["added"]}
        return Response({
            "rows": [r for r in rows if r["added"] or not r["is_new"]],
            "pairs": pairs,
            "total_added": len(pairs),
            "new_families": [f for f in new_families if f["temp_id"] in used],
            "unplaced": [{"id": s.id, "name": s.name, "reason": reason} for s, reason in plan.unplaced],
            "limit": MAX_FAMILY_SIZE,
        })


class DistributionConfirmView(FamilyConsoleView):
    def post(self, request):
        pairs = request.data.get("pairs")
        ok = isinstance(pairs, list) and pairs and all(
            isinstance(p, list) and len(p) == 2 and all(isinstance(i, int) for i in p) for p in pairs
        )
        if not ok:
            raise ValidationError({"pairs": "Run a preview first."})
        raw_new = request.data.get("new_families") or []
        if not isinstance(raw_new, list) or len(raw_new) > 50:
            raise ValidationError({"new_families": "Run a preview first."})
        new_families = []
        for item in raw_new:
            if not (isinstance(item, dict) and isinstance(item.get("temp_id"), int) and item["temp_id"] < 0):
                raise ValidationError({"new_families": "Run a preview first."})
            name = str(item.get("name", "")).strip()
            if not name or len(name) > 100:
                raise ValidationError({"new_families": "Each new family needs a name (maximum 100 letters)."})
            new_families.append((item["temp_id"], name))
        wanted = [n.lower() for _, n in new_families]
        if len(set(wanted)) != len(wanted) or Family.objects.filter(name__in=[n for _, n in new_families]).exists() or any(
            Family.objects.filter(name__iexact=n).exists() for n in wanted
        ):
            raise ValidationError({"new_families": "A family with one of these names now exists. Run the preview again."})
        # New families and their students are saved together: if nobody can be placed, no family is left behind.
        with transaction.atomic():
            made = {temp_id: Family.objects.create(name=name, gender=None).id for temp_id, name in new_families}
            real_pairs = [[student_id, made.get(family_id, family_id)] for student_id, family_id in pairs]
            # Every pair is re-checked (student free, family has room, gender fits) inside apply_distribution.
            batch, applied, skipped = apply_distribution(real_pairs, user=request.user)
            if batch is None:
                transaction.set_rollback(True)
        return Response({"applied": applied, "skipped": skipped, "batch": _batch_json(batch) if batch else None})


class DistributionUndoView(FamilyConsoleView):
    def post(self, request, pk):
        batch = FamilyDistributionBatch.objects.filter(pk=pk).first()
        if batch is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if batch.undone_at is not None:
            raise ValidationError({"detail": "This distribution was already undone."})
        return Response({"removed": undo_distribution(batch)})


# ── SMS ─────────────────────────────────────────────────────────────────────

def _sms_settings_json(config):
    return {
        "enabled": config.enabled,
        "monthly_limit": config.monthly_limit,
        "sent_this_month": config.sent_this_month(),
        "remaining_this_month": config.remaining_this_month(),
    }


class SmsSettingsView(ConsoleView):
    def get(self, request):
        return Response(_sms_settings_json(SMSConfiguration.get()))

    def patch(self, request):
        config = SMSConfiguration.get()
        if "enabled" in request.data:
            if not isinstance(request.data["enabled"], bool):
                raise ValidationError({"enabled": "Must be true or false."})
            config.enabled = request.data["enabled"]
        if "monthly_limit" in request.data:
            limit = request.data["monthly_limit"]
            if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0 or limit > 1_000_000:
                raise ValidationError({"monthly_limit": "Must be a whole number from 0 to 1,000,000."})
            config.monthly_limit = limit
        config.save()
        return Response(_sms_settings_json(config))


class SmsLogsView(ConsoleView):
    def get(self, request):
        qs = SMSLog.objects.select_related("user")
        wanted = request.query_params.get("status")
        if wanted:
            if wanted not in dict(SMSLog.STATUS_CHOICES):
                raise ValidationError({"status": "Unknown status."})
            qs = qs.filter(status=wanted)
        paginator = ConsolePagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response([
            {
                "id": log.id, "created_at": log.created_at,
                "user": full_name(log.user) if log.user else None, "phone": log.phone,
                "trigger": log.trigger, "status": log.status, "provider": log.provider, "error": log.error,
            }
            for log in page
        ])


# ── Departments and the yearly rollover ─────────────────────────────────────

def _department_json(d):
    return {
        "id": d.id, "name": d.name, "years": d.years, "is_active": d.is_active,
        "student_count": StudentProfile.objects.filter(department__iexact=d.name).count(),
    }


def _clean_years(raw):
    try:
        years = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"years": "Must be a number."})
    if not 3 <= years <= 7:
        raise ValidationError({"years": "A program lasts between 3 and 7 years."})
    return years


class DepartmentsView(ConsoleView):
    def get(self, request):
        return Response([_department_json(d) for d in Department.objects.all()])

    def post(self, request):
        name = str(request.data.get("name", "")).strip()
        if not name:
            raise ValidationError({"name": "Give the department a name."})
        if len(name) > 100:
            raise ValidationError({"name": "The name is too long (maximum 100)."})
        if Department.objects.filter(name__iexact=name).exists():
            raise ValidationError({"name": "This department already exists."})
        dept = Department.objects.create(name=name, years=_clean_years(request.data.get("years", 5)))
        return Response(_department_json(dept), status=status.HTTP_201_CREATED)


class DepartmentDetailView(ConsoleView):
    def _get(self, pk):
        dept = Department.objects.filter(pk=pk).first()
        if dept is None:
            raise ValidationError({"detail": "Department not found."})
        return dept

    @transaction.atomic
    def patch(self, request, pk):
        dept = self._get(pk)
        if "name" in request.data:
            name = str(request.data["name"]).strip()
            if not name:
                raise ValidationError({"name": "Give the department a name."})
            if Department.objects.filter(name__iexact=name).exclude(pk=dept.pk).exists():
                raise ValidationError({"name": "This department already exists."})
            if name != dept.name:
                # students keep the department as text, so renaming has to rename it for them too
                StudentProfile.objects.filter(department__iexact=dept.name).update(department=name)
                dept.name = name
        if "years" in request.data:
            years = _clean_years(request.data["years"])
            longest = StudentProfile.objects.filter(department__iexact=dept.name, status=StudentProfile.IN_CAMPUS).order_by("-batch_year").values_list("batch_year", flat=True).first()
            if longest and longest > years:
                raise ValidationError({"years": f"A student is already in year {longest}, so it cannot be shorter than that."})
            dept.years = years
        if "is_active" in request.data:
            if not isinstance(request.data["is_active"], bool):
                raise ValidationError({"is_active": "Must be true or false."})
            dept.is_active = request.data["is_active"]
        dept.save()
        return Response(_department_json(dept))

    def delete(self, request, pk):
        dept = self._get(pk)
        used = StudentProfile.objects.filter(department__iexact=dept.name).count()
        if used:
            raise ValidationError({"detail": f"{used} student(s) use this department. Hide it instead of deleting it."})
        dept.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _rollover_json(r, latest_id):
    return {
        "id": r.id, "label": r.label, "performed_at": r.performed_at,
        "performed_by": full_name(r.performed_by) if r.performed_by else None,
        "promoted": r.promoted, "graduated": r.graduated, "skipped": r.skipped,
        "undone_at": r.undone_at, "can_undo": r.id == latest_id and r.undone_at is None,
    }


class AcademicYearView(ConsoleView):
    """What "Start new year" would do right now, plus the history of earlier runs."""

    def get(self, request):
        latest = rollover.latest_rollover()
        history = YearRollover.objects.select_related("performed_by")[:8]
        return Response({
            "preview": rollover.build_preview(),
            "history": [_rollover_json(r, latest.id if latest else None) for r in history],
        })


class RolloverView(ConsoleView):
    def post(self, request):
        try:
            run = rollover.apply_rollover(
                request.user, label=str(request.data.get("label", "")), force=request.data.get("force") is True
            )
        except DjangoValidationError as exc:
            raise ValidationError({"detail": exc.messages[0]})
        latest = rollover.latest_rollover()
        return Response(_rollover_json(run, latest.id if latest else None), status=status.HTTP_201_CREATED)


class RolloverUndoView(ConsoleView):
    def post(self, request, pk):
        run = YearRollover.objects.filter(pk=pk).first()
        if run is None:
            raise ValidationError({"detail": "Run not found."})
        try:
            return Response(rollover.undo_rollover(run))
        except DjangoValidationError as exc:
            raise ValidationError({"detail": exc.messages[0]})
