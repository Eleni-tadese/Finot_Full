"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import os

from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from core.throttles import LoginView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from analytics.admin_views import ExportDashboardView
from analytics.public_views import PublicOverviewView, PublicRegistrationView

def health(request):
    """Is the server up? No database call, so hosts and uptime monitors can ask often."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path('health/', health, name='health'),
    path('', include('core.urls')),
    path('admin/reports-and-exports/', ExportDashboardView.as_view(), name='reports_and_exports'),
    path('admin/', admin.site.urls),
    path("auth/jwt/create/", LoginView.as_view(), name="jwt-create"),  # before djoser: its own throttles
    path("auth/", include("djoser.urls")),
    path("auth/", include("djoser.urls.jwt")),
    path("api/student/", include("student.urls")),
    path("api/account/", include("student.account_urls")),
    path("api/service/", include("service.urls")),
    path("api/qa/", include("questionanswer.urls")),
    path("api/donations/", include("donation.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/course/", include("course.urls")),
    path("api/resources/", include("resources.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/admin-console/", include("analytics.console_urls")),
    path("api/public/overview/", PublicOverviewView.as_view()),
    path("api/public/registration/", PublicRegistrationView.as_view()),
]




# The API documentation lists every endpoint: public only while developing (or when API_DOCS_PUBLIC is set).
if settings.DEBUG or os.environ.get("API_DOCS_PUBLIC"):
    urlpatterns += [
        # Download the raw schema file (YAML/JSON)
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        # Interactive UI (Swagger)
        path('api/docs/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
        # Alternative UI (Redoc)
        path('api/docs/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
