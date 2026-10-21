"""
The two codes of smart attendance. Both are computed from SECRET_KEY, so nothing secret is stored.

1. The student BADGE: a short signed text the student shows as a QR (printed or on their phone, no internet needed).
       FB1.<student id>.<badge version>.<signature>
   The signature is an HMAC over the id and version. Bumping StudentProfile.badge_version cancels an old badge.

2. The ROOM CODE: 6 digits shown by the organizer for self check-in. It is derived from the session id and the
   current 30-second window (like an authenticator app). The server accepts the current and the previous window,
   so a student who typed slowly is not rejected.
"""
import hashlib
import hmac
import time

from django.conf import settings

BADGE_PREFIX = "FB1"
ROOM_PREFIX = "FS1"
ROOM_WINDOW_SECONDS = 30


def _key(purpose):
    return hashlib.sha256(f"{purpose}:{settings.SECRET_KEY}".encode()).digest()


def _sig(purpose, message, length):
    return hmac.new(_key(purpose), message.encode(), hashlib.sha256).hexdigest()[:length]


# ---- badge -------------------------------------------------------------------------------------------------

def badge_for(user_id, version):
    return f"{BADGE_PREFIX}.{user_id}.{version}.{_sig('badge', f'{user_id}.{version}', 16)}"


def parse_badge(text):
    """Return (user_id, version) when the badge text is genuine, else None. Never raises."""
    parts = str(text or "").strip().split(".")
    if len(parts) != 4 or parts[0] != BADGE_PREFIX or not parts[1].isdigit() or not parts[2].isdigit():
        return None
    user_id, version = int(parts[1]), int(parts[2])
    if not hmac.compare_digest(parts[3], _sig("badge", f"{user_id}.{version}", 16)):
        return None
    return user_id, version


# ---- room code ---------------------------------------------------------------------------------------------

def _window(now=None):
    return int((now if now is not None else time.time()) // ROOM_WINDOW_SECONDS)


def room_code(session_id, now=None):
    """The 6-digit code for this session in the current 30-second window."""
    digest = _sig("room", f"{session_id}.{_window(now)}", 12)
    return f"{int(digest, 16) % 1_000_000:06d}"


def seconds_left(now=None):
    now = now if now is not None else time.time()
    return ROOM_WINDOW_SECONDS - int(now % ROOM_WINDOW_SECONDS)


def room_qr_text(session_id, now=None):
    """What the organizer's big QR contains: the student app reads the session and the code from it."""
    return f"{ROOM_PREFIX}.{session_id}.{room_code(session_id, now)}"


def room_code_is_valid(session_id, code, now=None):
    """True for the current or the previous window, so a code typed at the second 29 still works."""
    code = str(code or "").strip()
    if len(code) != 6 or not code.isdigit():
        return False
    now = now if now is not None else time.time()
    for moment in (now, now - ROOM_WINDOW_SECONDS):
        if hmac.compare_digest(code, room_code(session_id, moment)):
            return True
    return False
