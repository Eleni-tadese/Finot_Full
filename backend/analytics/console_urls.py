from django.urls import path

from . import console_views as v

urlpatterns = [
    path("overview/", v.OverviewView.as_view()),
    path("roles/", v.RolesView.as_view()),
    path("users/filters/", v.UserFilterOptionsView.as_view()),
    path("users/", v.UsersView.as_view()),
    path("users/<int:pk>/", v.UserDetailView.as_view()),
    path("sub-admins/", v.SubAdminsView.as_view()),
    path("service-groups/", v.ServiceGroupsView.as_view()),
    path("service-groups/<int:pk>/", v.ServiceGroupDetailView.as_view()),
    path("service-groups/<int:pk>/admin/", v.ServiceGroupAdminView.as_view()),
    path("qa/counselors/", v.CounselorsView.as_view()),
    path("qa/counselors/<int:pk>/specializations/", v.CounselorSpecializationsView.as_view()),
    path("service-config/", v.ServiceConfigView.as_view()),
    path("families/", v.FamiliesView.as_view()),
    path("families/distribution/", v.DistributionOverviewView.as_view()),
    path("families/distribution/preview/", v.DistributionPreviewView.as_view()),
    path("families/distribution/confirm/", v.DistributionConfirmView.as_view()),
    path("families/distribution/batches/<int:pk>/undo/", v.DistributionUndoView.as_view()),
    path("departments/", v.DepartmentsView.as_view()),
    path("departments/<int:pk>/", v.DepartmentDetailView.as_view()),
    path("academic-year/", v.AcademicYearView.as_view()),
    path("academic-year/rollover/", v.RolloverView.as_view()),
    path("academic-year/rollover/<int:pk>/undo/", v.RolloverUndoView.as_view()),
    path("donations/", v.DonationsView.as_view()),
    path("donations/recheck/", v.DonationsRecheckView.as_view()),
    path("sms/settings/", v.SmsSettingsView.as_view()),
    path("sms/logs/", v.SmsLogsView.as_view()),
]
