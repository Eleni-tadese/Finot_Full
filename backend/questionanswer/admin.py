from django.contrib import admin
from unfold.admin import ModelAdmin, StackedInline, TabularInline
from unfold.decorators import display
from .models import Question, Answer, TeacherSpecialization, PrivateQuestionAssignment


class AnswerInline(StackedInline):
    model = Answer
    extra = 0
    readonly_fields = ('created_at', 'is_approved')
    autocomplete_fields = ['responder']


class PrivateQuestionAssignmentInline(TabularInline):
    model = PrivateQuestionAssignment
    extra = 0
    fields = ('counselor', 'assigned_by', 'assigned_at')
    readonly_fields = ('assigned_by', 'assigned_at')
    autocomplete_fields = ['counselor']
    verbose_name_plural = "Assigned counselors (only used for private questions)"


@admin.register(TeacherSpecialization)
class TeacherSpecializationAdmin(ModelAdmin):
    list_display = ('user', 'specialization')
    list_filter = ('specialization',)
    search_fields = ('user__username', 'user__email', 'user__first_name', 'user__last_name')
    autocomplete_fields = ['user']


@admin.register(Answer)
class AnswerAdmin(ModelAdmin):
    list_display = ('question', 'responder', 'display_name', 'display_approved', 'created_at')
    list_filter = ('is_approved', 'created_at')
    search_fields = ('answer_body', 'display_name', 'responder__username', 'question__question_body')
    ordering = ('-created_at',)
    actions = ['approve_answers']
    autocomplete_fields = ['responder', 'question']
    list_per_page = 25

    @display(description="Approved", label={"Yes": "success", "No": "warning"})
    def display_approved(self, obj):
        return "Yes" if obj.is_approved else "No"

    @admin.action(description="Approve selected answers")
    def approve_answers(self, request, queryset):
        queryset.update(is_approved=True)


@admin.register(Question)
class QuestionAdmin(ModelAdmin):
    list_display = ('display_name', 'category', 'display_visibility', 'display_approved', 'created_at', 'user', 'answer_count_display')
    list_filter = ('is_approved', 'visibility', 'category', 'created_at')
    search_fields = ('question_body', 'display_name', 'user__username')
    ordering = ('-created_at',)
    inlines = [PrivateQuestionAssignmentInline, AnswerInline]
    actions = ['approve_questions']
    autocomplete_fields = ['user']
    list_per_page = 25

    def answer_count_display(self, obj):
        return obj.answers.count()
    answer_count_display.short_description = 'Answers'

    @display(description="Visibility", label={"Public": "info", "Private": "warning"})
    def display_visibility(self, obj):
        return obj.get_visibility_display()

    @display(description="Approved", label={"Yes": "success", "No": "warning"})
    def display_approved(self, obj):
        return "Yes" if obj.is_approved else "No"

    def save_formset(self, request, form, formset, change):
        instances = formset.save(commit=False)
        for obj in instances:
            if isinstance(obj, PrivateQuestionAssignment) and obj.assigned_by_id is None:
                obj.assigned_by = request.user
            obj.save()
        formset.save_m2m()
        for obj in formset.deleted_objects:
            obj.delete()

    @admin.action(description="Approve selected questions")
    def approve_questions(self, request, queryset):
        queryset.update(is_approved=True)
