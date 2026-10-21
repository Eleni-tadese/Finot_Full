import logging

from notifications.sms import send_sms, send_sms_bulk
from .base import NotificationChannel

logger = logging.getLogger(__name__)


class SMSChannel(NotificationChannel):
    """
    SMS delivery for the three agreed triggers only:
      * a private question was answered   (to the asker)
      * a new event was published         (to the opted-in students of its audience)
      * the weekly donation reminder      (see the send_weekly_reminders command)

    All the safety rules (admin switch, opt-in, valid number, monthly limit) are enforced
    inside notifications.sms.send_sms, so this channel is safe to leave registered.
    """

    def on_payment_completed(self, payment):
        pass  # not an SMS trigger

    def on_payment_failed(self, payment):
        pass  # not an SMS trigger

    def on_event_published(self, event):
        from notifications.models import SMSConfiguration, SMSLog

        if not SMSConfiguration.get().enabled:
            return
        from service.event_rules import notification_audience

        recipients = notification_audience(event).filter(
            student_profile__sms_opt_in=True
        ).select_related("student_profile")
        text = f"New event: {event.title}. Open Finot for the date and place."
        send_sms_bulk(recipients.iterator(chunk_size=200), text, SMSLog.TRIGGER_NEW_EVENT)

    def on_question_answered(self, answer):
        from notifications.models import SMSLog

        asker = answer.question.user
        if asker is None:
            return
        send_sms(
            asker, "Your private question was answered. Open Finot to read the answer.",
            SMSLog.TRIGGER_PRIVATE_ANSWER,
        )
