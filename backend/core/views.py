from django.http import HttpResponseRedirect, JsonResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from django.conf import settings


def home_page(request):
    """The backend's front door: visitors belong on the website, so send them there (address from FRONTEND_URL)."""
    site = (getattr(settings, "FRONTEND_URL", "") or "").strip()
    if site:
        return HttpResponseRedirect(site)
    return JsonResponse({"service": "Finot API", "status": "ok"})


class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client

    @property
    def callback_url(self):
        # Allow the frontend to pass the exact redirect_uri to prevent mismatches
        return self.request.data.get("redirect_uri", settings.FRONTEND_URL)
