import threading
import logging
from django.dispatch import receiver
from django.db import transaction
from django.db.models.signals import post_save

from donation.signals import payment_completed, payment_failed
from questionanswer.signals import question_answered
from .dispatch import NotificationDispatcher

logger = logging.getLogger(__name__)


@receiver(payment_completed)
def handle_payment_completed(sender, payment, **kwargs):
    """
    Receives the payment_completed signal from donation views.
    Defers notification dispatch until after the DB transaction commits.
    Runs in a background thread to prevent blocking the API response.
    """
    # Grab the ID to fetch freshly inside the thread
    payment_id = payment.id

    def _dispatch_in_thread():
        from donation.models import Payment
        from django.db import close_old_connections
        try:
            p = Payment.objects.get(id=payment_id)
            NotificationDispatcher.payment_completed(p)
        except Payment.DoesNotExist:
            logger.warning("handle_payment_completed: Payment id=%s not found.", payment_id)
        finally:
            close_old_connections()

    transaction.on_commit(
        lambda: threading.Thread(target=_dispatch_in_thread, daemon=True).start()
    )


@receiver(payment_failed)
def handle_payment_failed(sender, payment, **kwargs):
    """
    Receives the payment_failed signal from donation views.
    Runs in a background thread.
    """
    payment_id = payment.id

    def _dispatch_in_thread():
        from donation.models import Payment
        from django.db import close_old_connections
        try:
            p = Payment.objects.get(id=payment_id)
            NotificationDispatcher.payment_failed(p)
        except Payment.DoesNotExist:
            logger.warning("handle_payment_failed: Payment id=%s not found.", payment_id)
        finally:
            close_old_connections()

    transaction.on_commit(
        lambda: threading.Thread(target=_dispatch_in_thread, daemon=True).start()
    )


def announce_event(event_id):
    """
    Tell everyone about the event ONCE: at creation, or at the first edit that gives it a date that is not over
    yet (an event saved with a past date is Completed at birth and announces nothing until it is moved).
    Event.announced_at is the mark; it is claimed with one UPDATE so two saves never announce twice.
    Returns True when it announced.
    """
    from django.utils import timezone
    from service.models import Event

    event = Event.objects.filter(id=event_id).first()
    if event is None:
        logger.warning("announce_event: Event id=%s not found.", event_id)
        return False
    if event.announced_at or event.current_status == Event.COMPLETED:
        return False
    if Event.objects.filter(id=event_id, announced_at__isnull=True).update(announced_at=timezone.now()) != 1:
        return False  # another save claimed it a moment ago
    NotificationDispatcher.event_published(event)
    return True


@receiver(post_save, sender='service.Event')
def handle_event_published(sender, instance, created, **kwargs):
    """
    Listens to Event post_save (create and edit). Announces the event once, in a background thread, when it
    has not been announced yet and has not already ended (see announce_event).
    """
    if instance.announced_at is None:
        event_id = instance.id

        def _dispatch_in_thread():
            from django.db import close_old_connections
            try:
                announce_event(event_id)
            finally:
                close_old_connections()

        transaction.on_commit(
            lambda: threading.Thread(target=_dispatch_in_thread, daemon=True).start()
        )


@receiver(question_answered)
def handle_question_answered(sender, answer, **kwargs):
    """
    Receives the question_answered signal from questionanswer views.
    Defers notification dispatch until after the DB transaction commits.
    Runs in a background thread to prevent blocking the API response.
    """
    answer_id = answer.id

    def _dispatch_in_thread():
        from questionanswer.models import Answer
        from django.db import close_old_connections
        try:
            a = Answer.objects.select_related("question__user").get(id=answer_id)
            NotificationDispatcher.question_answered(a)
        except Answer.DoesNotExist:
            logger.warning("handle_question_answered: Answer id=%s not found.", answer_id)
        finally:
            close_old_connections()

    transaction.on_commit(
        lambda: threading.Thread(target=_dispatch_in_thread, daemon=True).start()
    )



@receiver(post_save, sender='questionanswer.Question')
def handle_public_question_submitted(sender, instance, created, **kwargs):
    """A new public question waits for the moderators."""
    if not (created and instance.visibility == 'PUBLIC' and not instance.is_approved):
        return
    try:
        from .qa_alerts import notify_moderators, short
        notify_moderators(
            "New question to approve",
            f"{instance.display_name} asked ({instance.category}): {short(instance.question_body)}",
        )
    except Exception:
        logger.exception("Could not alert the moderators about a new question")


@receiver(post_save, sender='questionanswer.Answer')
def handle_public_answer_submitted(sender, instance, created, **kwargs):
    """A new answer on a public question waits for the moderators."""
    if not (created and not instance.is_approved and instance.question.visibility == 'PUBLIC'):
        return
    try:
        from .qa_alerts import notify_moderators, short
        notify_moderators(
            "New answer to approve",
            f"{instance.display_name} answered: {short(instance.answer_body)}",
        )
    except Exception:
        logger.exception("Could not alert the moderators about a new answer")


@receiver(post_save, sender='questionanswer.Question')
def handle_private_question_submitted(sender, instance, created, **kwargs):
    """A new private question: tell the counselors who can see it (or the Super Admin to assign it)."""
    if not (created and instance.visibility == 'PRIVATE'):
        return
    try:
        from .qa_alerts import notify_counselors_of_private_question
        notify_counselors_of_private_question(instance)
    except Exception:
        logger.exception("Could not alert the counselors about a new private question")


@receiver(post_save, sender='questionanswer.PrivateQuestionAssignment')
def handle_private_question_assigned(sender, instance, created, **kwargs):
    """The Super Admin assigned a private question to a counselor."""
    if not created:
        return
    try:
        from .qa_alerts import notify_counselor_assigned
        notify_counselor_assigned(instance)
    except Exception:
        logger.exception("Could not alert the counselor about an assignment")
