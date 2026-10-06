"""
SMS providers.

A provider is any class with a send(phone, message) method that returns the provider's
message id (a string) or raises an exception on failure. To add a real provider
(Africa's Talking, Twilio, a local aggregator...):

    1. add a class below with that send() method (keys/URL come from environment variables),
    2. register it in PROVIDERS,
    3. set SMS_PROVIDER=<name> in .env.

Nothing else in the project changes. See SMS_PLAN.md in the project root.
"""
import logging
import os

logger = logging.getLogger(__name__)


class ConsoleProvider:
    """Free development provider: writes the message to the server log, sends nothing."""

    name = "console"

    def send(self, phone, message):
        logger.info("[SMS console] to=%s text=%s", phone, message)
        return "console"


PROVIDERS = {
    ConsoleProvider.name: ConsoleProvider,
}


def get_provider():
    name = (os.environ.get("SMS_PROVIDER") or ConsoleProvider.name).strip().lower()
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise RuntimeError(f"Unknown SMS_PROVIDER '{name}'. Available: {', '.join(sorted(PROVIDERS))}")
