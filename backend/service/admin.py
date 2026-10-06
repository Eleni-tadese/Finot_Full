from django.contrib import admin, messages
from django.shortcuts import render, redirect
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import display, action
from .services import (
    MAX_FAMILY_SIZE, apply_distribution, assign_students_to_family, build_distribution_plan,
    get_filter_options, get_unassigned_freshers, undo_distribution,
)
from .models import (
    ServiceGroup, AgeglotSelection, Family, FamilyMembership,
    Event, ServiceConfiguration, ServiceGroupMembership, ServiceAttendance, FamilyDistributionBatch
)


# ── Inlines ─────────────────────────────────────────────────────────

class FamilyMembershipInline(TabularInline):
    model = FamilyMembership
    extra = 0
    autocomplete_fields = ['student']
    readonly_fields = ('joined_at',)


class ServiceGroupMembershipInline(TabularInline):
    model = ServiceGroupMembership
    extra = 0
    autocomplete_fields = ['student']
    readonly_fields = ('joined_at',)


class ServiceAttendanceInline(TabularInline):
    model = ServiceAttendance
    extra = 0
    autocomplete_fields = ['student']
    readonly_fields = ('recorded_at',)


# ── Model Admins ────────────────────────────────────────────────────

@admin.register(ServiceConfiguration)
class ServiceConfigurationAdmin(ModelAdmin):
    list_display = ('__str__', 'is_selection_open')

    def has_add_permission(self, request):
        if self.model.objects.exists():
            return False
        return super().has_add_permission(request)


@admin.register(ServiceGroupMembership)
class ServiceGroupMembershipAdmin(ModelAdmin):
    list_display = ('student', 'service_group', 'display_role', 'display_status', 'joined_at')
    list_filter = ('service_group', 'role', 'status')
    search_fields = ('student__username', 'student__first_name', 'service_group__name')
    autocomplete_fields = ['student', 'service_group']
    list_per_page = 25

    @display(description="Role", label={"Member": "info", "Leader": "success", "Coordinator": "warning"})
    def display_role(self, obj):
        return obj.role

    @display(description="Status", label={"Active": "success", "Probation": "warning", "Inactive": "danger"})
    def display_status(self, obj):
        return obj.status


@admin.register(ServiceAttendance)
class ServiceAttendanceAdmin(ModelAdmin):
    list_display = ('event', 'student', 'display_status', 'recorded_at')
    list_filter = ('event', 'status', 'recorded_at')
    search_fields = ('student__username', 'event__title')
    autocomplete_fields = ['student', 'event']
    list_per_page = 25

    @display(description="Status", label={"Present": "success", "Absent": "danger"})
    def display_status(self, obj):
        return obj.status


@admin.register(Event)
class EventAdmin(ModelAdmin):
    list_display = ('title', 'display_status', 'start_date', 'end_date', 'service_group', 'created_by', 'created_at')
    list_filter = ('status', 'start_date', 'service_group', 'created_at')
    search_fields = ('title', 'description', 'created_by__username')
    date_hierarchy = 'start_date'
    list_per_page = 25
    inlines = [ServiceAttendanceInline]

    fieldsets = (
        (None, {
            "fields": ("title", "description", "photo", "status"),
        }),
        ("Schedule", {
            "fields": ("start_date", "end_date"),
        }),
        ("Location", {
            "fields": ("place_name", "place_url"),
            "classes": ("collapse",),
        }),
        ("Assignment", {
            "fields": ("service_group", "created_by"),
        }),
    )

    @display(description="Status", label={"Upcoming": "info", "Ongoing": "warning", "Completed": "success"})
    def display_status(self, obj):
        return obj.status


@admin.register(ServiceGroup)
class ServiceGroupAdmin(ModelAdmin):
    list_display = ('name', 'admin', 'member_count', 'created_at')
    search_fields = ('name', 'admin__username')
    autocomplete_fields = ['admin']
    readonly_fields = ('updated_at',)
    list_per_page = 25
    inlines = [ServiceGroupMembershipInline]

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = "Members"


@admin.register(AgeglotSelection)
class AgeglotSelectionAdmin(ModelAdmin):
    list_display = ('student', 'service_group', 'priority', 'created_at')
    list_filter = ('priority', 'service_group', 'created_at')
    search_fields = ('student__username', 'service_group__name')
    ordering = ('student', 'priority')
    autocomplete_fields = ['student', 'service_group']
    list_per_page = 25


@admin.register(FamilyMembership)
class FamilyMembershipAdmin(ModelAdmin):
    list_display = ('student', 'family', 'joined_at')
    search_fields = ('student__username', 'student__first_name', 'family__name')
    list_filter = ('family',)
    autocomplete_fields = ['student', 'family']
    list_per_page = 25


@admin.register(Family)
class FamilyAdmin(ModelAdmin):
    list_display = ('name', 'display_gender', 'father', 'mother', 'religious_father', 'member_count', 'created_at')
    search_fields = ('name', 'father__username', 'mother__username', 'religious_father')
    autocomplete_fields = ['father', 'mother']
    list_filter = ('gender', 'created_at')
    list_per_page = 25
    inlines = [FamilyMembershipInline]
    actions_detail = ['assign_students']
    actions_list = ['smart_distribute']

    @display(description="Gender", label={"Male": "info", "Female": "warning"})
    def display_gender(self, obj):
        return obj.get_gender_display() if obj.gender else "Not Set"

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = "Members"

    @action(description="Smart distribution", url_path="smart-distribute")
    def smart_distribute(self, request):
        """
        Preview -> Confirm -> Undo for automatic, balanced family assignment.
        Super Admin only. Nothing is saved until "Confirm" is pressed.
        """
        from core.models import Role
        if not (request.user.is_superuser or request.user.roles.filter(name=Role.SUPER_ADMIN).exists()):
            self.message_user(request, "Permission denied. Only SuperAdmins can perform this action.", level=messages.ERROR)
            return redirect("admin:service_family_changelist")
        here = "admin:service_family_smart_distribute"

        if request.method == "POST":
            step = request.POST.get("step")

            if step == "undo":
                batch = FamilyDistributionBatch.objects.filter(pk=request.POST.get("batch")).first()
                if batch is None or batch.undone_at is not None:
                    self.message_user(request, "That distribution cannot be undone.", level=messages.ERROR)
                else:
                    removed = undo_distribution(batch)
                    self.message_user(request, f"Undone: {removed} student(s) removed from their families.", level=messages.SUCCESS)
                return redirect(here)

            if step == "confirm":
                pairs = request.session.pop("smart_distribution_pairs", None)
                if not pairs:
                    self.message_user(request, "The preview expired. Run the preview again.", level=messages.ERROR)
                    return redirect(here)
                batch, applied, skipped = apply_distribution(pairs, user=request.user)
                if applied:
                    self.message_user(request, f"Assigned {applied} student(s). You can undo this below.", level=messages.SUCCESS)
                for line in skipped:
                    self.message_user(request, f"Skipped - {line}", level=messages.WARNING)
                if not applied and not skipped:
                    self.message_user(request, "Nothing to assign.", level=messages.WARNING)
                return redirect(here)

            if step == "preview":
                gender = request.POST.get("gender", "")
                dorm_block = request.POST.get("dorm_block", "")
                section = request.POST.get("section", "")
                family_ids = [int(i) for i in request.POST.getlist("families") if i.isdigit()]
                families = Family.objects.filter(pk__in=family_ids).order_by("name")
                students = get_unassigned_freshers(
                    gender=gender or None,
                    dorm_block=int(dorm_block) if dorm_block.isdigit() else None,
                    section=int(section) if section.isdigit() else None,
                )
                plan, family_map, _ = build_distribution_plan(students, families)
                request.session["smart_distribution_pairs"] = [
                    [student.id, family_id]
                    for family_id, members in plan.assignments.items()
                    for student in members
                ]
                rows = []
                for family_id, members in plan.assignments.items():
                    family = family_map[family_id]
                    current = family.members.count()
                    rows.append({
                        "family": family,
                        "current": current,
                        "added": members,
                        "after": current + len(members),
                    })
                sizes = [r["after"] for r in rows]
                context = {
                    **self.admin_site.each_context(request),
                    "title": "Smart distribution - preview",
                    "opts": self.model._meta,
                    "mode": "preview",
                    "rows": rows,
                    "unplaced": plan.unplaced,
                    "total_added": sum(len(r["added"]) for r in rows),
                    "min_size": min(sizes) if sizes else 0,
                    "max_size": max(sizes) if sizes else 0,
                    "limit": MAX_FAMILY_SIZE,
                }
                return render(request, "admin/smart_distribution.html", context)

            return redirect(here)

        families = Family.objects.order_by("name")
        context = {
            **self.admin_site.each_context(request),
            "title": "Smart distribution",
            "opts": self.model._meta,
            "mode": "form",
            "families": [(f, f.members.count()) for f in families],
            "unassigned_count": get_unassigned_freshers().count(),
            "filter_options": get_filter_options(),
            "batches": FamilyDistributionBatch.objects.select_related("created_by")[:10],
            "limit": MAX_FAMILY_SIZE,
        }
        return render(request, "admin/smart_distribution.html", context)

    @action(description="Assign Students")
    def assign_students(self, request, object_id):
        # SuperAdmin-only check
        from core.models import Role
        if not (request.user.is_superuser or request.user.roles.filter(name=Role.SUPER_ADMIN).exists()):
            self.message_user(request, "Permission denied. Only SuperAdmins can perform this action.", level=messages.ERROR)
            return redirect("admin:service_family_change", object_id)

        family = self.get_object(request, object_id)
        if not family:
            return redirect("admin:service_family_changelist")

        # Handle POST — assign selected students
        if request.method == "POST" and request.POST.getlist("selected_students"):
            student_ids = request.POST.getlist("selected_students")
            results = assign_students_to_family(family, student_ids)

            if results["assigned_count"] > 0:
                self.message_user(
                    request,
                    f"Successfully assigned {results['assigned_count']} student(s) to {family.name}.",
                    level=messages.SUCCESS,
                )
            for warning in results.get("warnings", []):
                self.message_user(request, warning, level=messages.WARNING)
            for name in results.get("skipped_names", []):
                self.message_user(request, f"Skipped: {name}", level=messages.WARNING)

            return redirect("admin:service_family_change", object_id)

        # Handle GET — show filtered student list
        gender = request.GET.get("gender", "")
        dorm_block = request.GET.get("dorm_block", "")
        dorm_room = request.GET.get("dorm_room", "")
        section = request.GET.get("section", "")

        students = get_unassigned_freshers(
            gender=gender or None,
            dorm_block=int(dorm_block) if dorm_block else None,
            dorm_room=int(dorm_room) if dorm_room else None,
            section=int(section) if section else None,
        )

        filter_options = get_filter_options()
        current_count = family.members.count()

        context = {
            **self.admin_site.each_context(request),
            "title": f"Assign Students to {family.name}",
            "opts": self.model._meta,
            "family": family,
            "current_count": current_count,
            "max_size": 15,
            "available_slots": 15 - current_count,
            "students": students,
            "student_count": students.count(),
            "filter_options": filter_options,
            "current_filters": {
                "gender": gender,
                "dorm_block": dorm_block,
                "dorm_room": dorm_room,
                "section": section,
            },
        }
        return render(request, "admin/distribute_freshers.html", context)
