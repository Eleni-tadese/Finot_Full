"""
Safety net for payments whose donor never came back to the success page (closed the tab, lost the
connection, or on a local machine where Chapa cannot call our webhook).

  * PENDING or FAILED in the last 3 days and Chapa says paid  -> COMPLETED
  * PENDING for more than 24 hours and Chapa says not paid    -> FAILED
  * anything else (Chapa unreachable, still young)            -> left alone
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Payment
from .signals import payment_completed, payment_failed
from .utils import ChapaPayment

MIN_AGE = timedelta(minutes=10)      # do not bother a donor who is still on the Chapa page
GIVE_UP_AFTER = timedelta(hours=24)  # an unpaid pending payment this old is abandoned
LOOK_BACK = timedelta(days=3)
MAX_PER_RUN = 200


def recheck_pending_payments(chapa=None, now=None, min_age=MIN_AGE):
    """Returns {"checked": n, "completed": n, "failed": n, "left": n}."""
    chapa = chapa or ChapaPayment()
    now = now or timezone.now()
    candidates = (
        Payment.objects.filter(status__in=[Payment.STATUS_PENDING, Payment.STATUS_FAILED], created_at__gte=now - LOOK_BACK)
        .order_by("created_at")[:MAX_PER_RUN]
    )
    result = {"checked": 0, "completed": 0, "failed": 0, "left": 0}
    for payment in list(candidates):
        if payment.status == Payment.STATUS_PENDING and now - payment.created_at < min_age:
            result["left"] += 1
            continue
        result["checked"] += 1
        state = chapa.check_payment(payment.transaction_reference)
        outcome = None
        with transaction.atomic():
            locked = Payment.objects.select_for_update().get(pk=payment.pk)
            if state == "paid" and locked.status != Payment.STATUS_COMPLETED:
                locked.status = Payment.STATUS_COMPLETED
                locked.save(update_fields=["status"])
                outcome = "completed"
            elif state == "unpaid" and locked.status == Payment.STATUS_PENDING and now - locked.created_at >= GIVE_UP_AFTER:
                locked.status = Payment.STATUS_FAILED
                locked.save(update_fields=["status"])
                outcome = "failed"
        if outcome == "completed":
            payment_completed.send(sender=Payment, payment=locked)
            result["completed"] += 1
        elif outcome == "failed":
            payment_failed.send(sender=Payment, payment=locked)
            result["failed"] += 1
        else:
            result["left"] += 1
    return result
