import hmac
from django.conf import settings
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notification, FCMDeviceToken
from .class_reminders import send_class_reminders
from .reminders import send_weekly_reminders
from .serializers import NotificationSerializer, FCMDeviceTokenSerializer


class FCMDeviceTokenViewSet(viewsets.ModelViewSet):
    """
    Registers the Firebase Cloud Messaging device token.
    """

    serializer_class = FCMDeviceTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return FCMDeviceToken.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        device_token = request.data.get("device_token")

        # Grab existing token to bypass UniqueValidator on update
        instance = FCMDeviceToken.objects.filter(device_token=device_token).first()

        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        # Save forces updating the user field to the current logged-in user
        serializer.save(user=request.user)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK if instance else status.HTTP_201_CREATED,
        )


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    List user notifications. Allows marking as read.
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({"status": "Notification marked as read"})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"status": "All notifications marked as read"})


class WeeklyReminderTriggerView(APIView):
    """
    Called by a free external scheduler (see .github/workflows/weekly-reminders.yml).
    Protected by the CRON_SECRET environment variable, sent in the X-Cron-Token header.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        secret = getattr(settings, "CRON_SECRET", "")
        sent = request.headers.get("X-Cron-Token", "")
        if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(send_weekly_reminders(force=bool(request.data.get("force")), background_email=True))


class AccountSetupReminderTriggerView(APIView):
    """Daily trigger for the "finish your account" reminders (see .github/workflows/account-setup-reminders.yml)."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        from .account_setup_reminders import send_account_setup_reminders

        secret = getattr(settings, "CRON_SECRET", "")
        sent = request.headers.get("X-Cron-Token", "")
        if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(send_account_setup_reminders())


class ClassReminderTriggerView(APIView):
    """Daily trigger for the "class tomorrow" notifications (see .github/workflows/class-reminders.yml). Same secret as the weekly one."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        secret = getattr(settings, "CRON_SECRET", "")
        sent = request.headers.get("X-Cron-Token", "")
        if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(send_class_reminders())


class EmailOutboxTriggerView(APIView):
    """6-hourly trigger (see .github/workflows/email-outbox.yml): close forgotten attendance sessions, queue the
    "event tomorrow" reminders, send the waiting outbox emails up to the daily limit. Same secret as the others."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        from .outbox import run_email_cron

        secret = getattr(settings, "CRON_SECRET", "")
        sent = request.headers.get("X-Cron-Token", "")
        if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(run_email_cron())
