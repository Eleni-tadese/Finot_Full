"""
SMS sending with all the safety checks in one place.

    send_sms(user, text, SMSLog.TRIGGER_PRIVATE_ANSWER)
    send_sms_bulk(users, text, SMSLog.TRIGGER_NEW_EVENT)

A message is sent only when ALL of these hold:
  1. the admin switch (SMS configuration -> enabled) is on,
  2. the user opted in (StudentProfile.sms_opt_in),
  3. the user has a usable phone number,
  4. this month's message limit has not been reached.
Messages skipped because SMS is off or the user did not opt in are not logged
(they would flood the log); every real attempt is logged.
"""
import logging

from .phone import normalize_phone
from .providers import get_provider

logger = logging.getLogger(__name__)

MAX_LENGTH = 160  # one GSM message; Amharic (UCS-2) fits about 70 characters per message


def _prepare(user):
    """Returns (profile, phone). profile is None when the user never opted in."""
    profile = getattr(user, "student_profile", None)
    if profile is None or not profile.sms_opt_in:
        return None, None
    return profile, normalize_phone(profile.personal_phone)


def send_sms(user, text, trigger, *, config=None, provider=None):
    """Send one SMS. Returns the SMSLog row, or None when nothing was attempted."""
    from notifications.models import SMSConfiguration, SMSLog

    config = config or SMSConfiguration.get()
    if not config.enabled:
        return None
    profile, phone = _prepare(user)
    if profile is None:
        return None

    text = text if len(text) <= MAX_LENGTH else text[: MAX_LENGTH - 1] + "…"
    provider = provider or get_provider()
    log = SMSLog(
        user=user, phone=phone or (profile.personal_phone or ""), message=text,
        trigger=trigger, provider=getattr(provider, "name", "?"),
    )

    if phone is None:
        log.status, log.error = SMSLog.STATUS_INVALID_PHONE, "Phone number is missing or not valid."
    elif config.remaining_this_month() <= 0:
        log.status, log.error = SMSLog.STATUS_LIMIT, f"Monthly limit of {config.monthly_limit} reached."
    else:
        try:
            log.provider_message_id = str(provider.send(phone, text) or "")
            log.status = SMSLog.STATUS_SENT
        except Exception as exc:  # a provider outage must never break the request or the other channels
            logger.error("SMS to user %s failed", user.pk, exc_info=True)
            log.status, log.error = SMSLog.STATUS_FAILED, str(exc)[:500]
    log.save()
    return log


def send_sms_bulk(users, text, trigger):
    """Send the same text to many users; stops quietly once the monthly limit is used up."""
    from notifications.models import SMSConfiguration, SMSLog

    config = SMSConfiguration.get()
    if not config.enabled:
        return 0
    provider = get_provider()
    sent = 0
    for user in users:
        if config.remaining_this_month() <= 0:
            logger.warning("SMS monthly limit reached; remaining recipients skipped.")
            break
        log = send_sms(user, text, trigger, config=config, provider=provider)
        if log and log.status == SMSLog.STATUS_SENT:
            sent += 1
    return sent
