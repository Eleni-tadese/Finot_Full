"""
Sign-in throttling that works for a campus.

Hundreds of students share one public IP address (the campus Wi-Fi), so the general 30-a-minute limit per IP would lock
most of them out at a welcome event. Sign-in is therefore limited in two ways:
  * per account: a wrong password cannot be guessed quickly (10 attempts a minute for one email);
  * per address: a very high ceiling that still stops one machine from trying thousands of different emails.
"""
import hashlib

from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView


class LoginIPThrottle(SimpleRateThrottle):
    scope = "login_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginAccountThrottle(SimpleRateThrottle):
    scope = "login_user"

    def get_cache_key(self, request, view):
        name = str(request.data.get("username") or request.data.get("email") or "").strip().lower()
        if not name:
            return None
        return self.cache_format % {"scope": self.scope, "ident": hashlib.sha256(name.encode()).hexdigest()}


class LoginView(TokenObtainPairView):
    """POST /auth/jwt/create/ with the campus-friendly limits above."""

    throttle_classes = [LoginIPThrottle, LoginAccountThrottle]
