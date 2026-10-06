"""Phone number normalisation (Ethiopian numbers by default, any E.164 number accepted)."""
import re

_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def normalize_phone(raw, default_country_code="251"):
    """
    Returns the number in E.164 form (+2519XXXXXXXX) or None when it is not usable.

        0911223344        -> +251911223344
        911223344         -> +251911223344
        +251 91 122 33 44 -> +251911223344
        00251911223344    -> +251911223344
    """
    if not raw:
        return None
    digits = re.sub(r"[\s\-().]", "", str(raw))
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        if digits.startswith("0"):
            digits = "+" + default_country_code + digits[1:]
        elif len(digits) == 9:
            digits = "+" + default_country_code + digits
        elif digits.startswith(default_country_code):
            digits = "+" + digits
        else:
            return None
    if not _E164.match(digits):
        return None
    if digits.startswith("+251") and not re.match(r"^\+251[79]\d{8}$", digits):
        return None  # Ethiopian mobile numbers start with 9 or 7 after the country code
    return digits
