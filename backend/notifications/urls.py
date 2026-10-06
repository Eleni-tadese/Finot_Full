from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ClassReminderTriggerView, FCMDeviceTokenViewSet, NotificationViewSet, WeeklyReminderTriggerView

router = DefaultRouter()
router.register(r'device-token', FCMDeviceTokenViewSet, basename='device-token')
router.register(r'', NotificationViewSet, basename='notification')

urlpatterns = [
    path('cron/class-reminders/', ClassReminderTriggerView.as_view(), name='cron-class-reminders'),
    path('cron/weekly-reminders/', WeeklyReminderTriggerView.as_view(), name='cron-weekly-reminders'),
    path('', include(router.urls)),
]
