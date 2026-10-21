from django.urls import path

from . import views

urlpatterns = [
    path("badge/me/", views.MyBadgeView.as_view(), name="attendance-my-badge"),
    path("sessions/open/", views.OpenSessionView.as_view(), name="attendance-open"),
    path("sessions/current/", views.CurrentSessionView.as_view(), name="attendance-current"),
    path("sessions/open-for-me/", views.OpenForMeView.as_view(), name="attendance-open-for-me"),
    path("sessions/<int:pk>/", views.SessionDetailView.as_view(), name="attendance-session"),
    path("sessions/<int:pk>/close/", views.CloseSessionView.as_view(), name="attendance-close"),
    path("sessions/<int:pk>/reopen/", views.ReopenSessionView.as_view(), name="attendance-reopen"),
    path("sessions/<int:pk>/helpers/", views.HelpersView.as_view(), name="attendance-helpers"),
    path("sessions/<int:pk>/code/", views.RoomCodeView.as_view(), name="attendance-code"),
    path("sessions/<int:pk>/scan/", views.ScanView.as_view(), name="attendance-scan"),
    path("sessions/<int:pk>/sync/", views.SyncView.as_view(), name="attendance-sync"),
    path("sessions/<int:pk>/self-check-in/", views.SelfCheckInView.as_view(), name="attendance-self-check-in"),
]
