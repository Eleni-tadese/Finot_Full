import datetime
from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied
from django.utils.decorators import method_decorator
from django.views import View
from student.models import StudentProfile
from .exports import (
    event_attendance_sheets, events_sheets, families_sheets, private_qa_sheets, students_sheets,
)
from .utils.export import calculate_target_batch, generate_csv_response, generate_json_response
from .utils.xlsx import xlsx_response

from django.contrib import admin

@method_decorator(staff_member_required, name='dispatch')
class ExportDashboardView(View):
    template_name = "admin/reports_and_exports.html"

    # Whole-table Excel downloads (Super Admin only; same builders as the REST API)
    XLSX_EXPORTS = {
        "families": lambda: families_sheets(),
        "private-qa": lambda: private_qa_sheets(),
        "events": lambda: events_sheets(),
        "event-attendance": lambda: event_attendance_sheets(),
    }

    def get(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied
        which = request.GET.get("xlsx")
        if which in self.XLSX_EXPORTS:
            return xlsx_response(f"{which}.xlsx", self.XLSX_EXPORTS[which]())

        # Fetch unique departments for the dropdown
        departments = StudentProfile.objects.exclude(department__isnull=True)\
                                            .exclude(department="")\
                                            .values_list('department', flat=True).distinct()
        
        context = dict(
            admin.site.each_context(request),
            title="Reports & Exports",
            departments=departments,
            is_nav_sidebar_enabled=True,
        )
        return render(request, self.template_name, context)

    def post(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied
        batch = request.POST.get('batch')
        year = request.POST.get('year')
        department = request.POST.get('department')
        export_format = request.POST.get('format', 'csv')
        
        # Get selected fields
        # Mandatory fields
        fields = ['first_name', 'last_name', 'username']
        
        # Optional fields passed from checkboxes
        optional_fields = request.POST.getlist('fields')
        fields.extend(optional_fields)

        # Base QuerySet
        queryset = StudentProfile.objects.select_related('user').all()

        # Apply Filters
        if batch and batch.strip():
            if year and year.strip():
                # Historical Calculation
                target_batch = calculate_target_batch(year, batch)
                queryset = queryset.filter(batch_year=target_batch)
                filename_prefix = f"students_batch{batch}_year{year}"
            else:
                # Current Batch
                queryset = queryset.filter(batch_year=batch)
                current_year = datetime.datetime.now().year
                filename_prefix = f"students_batch{batch}_{current_year}"
        else:
            # All Batches (Current)
            current_year = datetime.datetime.now().year
            filename_prefix = f"all_students_{current_year}"

        if department and department.strip():
            queryset = queryset.filter(department=department)
            filename_prefix += f"_{department[:10].replace(' ', '')}"

        # Generate File
        filename = f"{filename_prefix}.{export_format}"

        if export_format == 'xlsx':
            return xlsx_response(filename, students_sheets(queryset))
        if export_format == 'csv':
            return generate_csv_response(queryset, fields, filename)
        elif export_format == 'json':
            return generate_json_response(queryset, fields, filename)
        else:
            # Unknown format: fall back to CSV
            return generate_csv_response(queryset, fields, f"{filename_prefix}.csv")

