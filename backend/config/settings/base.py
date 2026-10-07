from pathlib import Path
import dj_database_url
import os
from dotenv import load_dotenv
from datetime import timedelta
from urllib.parse import urlparse

from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _
from django.templatetags.static import static

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# Updated to .parent.parent.parent because base.py is inside config/settings/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(name):
    """Comma-separated env var -> list of non-empty stripped strings."""
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


# An empty SECRET_KEY in .env must behave like "not set".
SECRET_KEY = os.environ.get("SECRET_KEY") or "unsafe-dev-fallback-key"

# Application definition
INSTALLED_APPS = [
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "unfold.contrib.inlines",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "whitenoise.runserver_nostatic",
    "cloudinary_storage",
    "cloudinary",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "dj_rest_auth",
    "django.contrib.sites",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "djoser",
    "drf_spectacular",
    "core",
    "student",
    "service",
    "donation",
    "questionanswer",
    "notifications",
    "course",
    "analytics",
    "resources",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL") or "sqlite:///db.sqlite3",
        conn_max_age=700,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SITE_ID = 1

# Accounts are given by the organization on printed slips. Set SELF_REGISTRATION_OPEN=true to let visitors sign up themselves.
SELF_REGISTRATION_OPEN = (os.environ.get("SELF_REGISTRATION_OPEN") or "").lower() in ("1", "true", "yes")

# Students registered by the bulk import may use their printed slip (email + password) for this many days;
# after that they must give a real email and choose a new password.
ACCOUNT_SETUP_GRACE_DAYS = int(os.environ.get("ACCOUNT_SETUP_GRACE_DAYS") or 21)

# Where Django sends users after a login that has no ?next= (e.g. /admin/login/ opened directly).
LOGIN_REDIRECT_URL = "/admin/"

REST_USE_JWT = True
REST_AUTH = {
    "USE_JWT": True,
    "JWT_AUTH_COOKIE": "finot-auth",
    "JWT_AUTH_REFRESH_COOKIE": "finot-refresh-token",
}

AUTHENTICATION_BACKENDS = [
    "core.backends.EmailAuthenticationBackend",
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# CORS basic headers config (origins will be in dev/prod)
CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Addis_Ababa"  # people type event times in local time; stored internally as UTC

# Secret for the scheduled weekly-reminder trigger. Empty = trigger disabled.
CRON_SECRET = os.getenv("CRON_SECRET", "")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "core.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "student.authentication.SetupAwareJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.AllowAny",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Override in .env, e.g. THROTTLE_USER=600/minute for local testing.
        # Many students share one campus IP, so these are per address and generous; sign-in has its own limits.
        "anon": os.environ.get("THROTTLE_ANON") or "120/minute",
        "user": os.environ.get("THROTTLE_USER") or "120/minute",
        "login_ip": os.environ.get("THROTTLE_LOGIN_IP") or "600/minute",
        "login_user": os.environ.get("THROTTLE_LOGIN_USER") or "10/minute",
    },
    # How many proxies sit in front of the app (Render: 1). Needed so the visitor's real address is used and cannot be
    # faked with an X-Forwarded-For header. Leave empty on a laptop.
    "NUM_PROXIES": int(os.environ["NUM_PROXIES"]) if os.environ.get("NUM_PROXIES") else None,
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
PUBLIC_DOMAIN = os.environ.get("PUBLIC_DOMAIN", "")

# Djoser builds password-reset links as "{protocol}://{DOMAIN}/{url}", so DOMAIN
# must be a bare host (no scheme) and must be the FRONTEND host.
DOMAIN = urlparse(FRONTEND_URL).netloc
SITE_NAME = "Finot"

DJOSER = {
    "PASSWORD_RESET_CONFIRM_URL": "password-reset/confirm/{uid}/{token}",
    "LOGIN_FIELD": "email",
    "USER_CREATE_PASSWORD_RETYPE": False,
    "SERIALIZERS": {
        "user_create": "core.serializers.UserCreateSerializer",
        "user": "core.serializers.UserSerializer",
        "current_user": "core.serializers.UserSerializer",
    },
    "PERMISSIONS": {
        "user": ["core.permissions.IsAuthenticatedAndReadOnly"],
        "user_list": ["djoser.permissions.CurrentUserOrAdminOrReadOnly"],
        "user_delete": ["rest_framework.permissions.IsAdminUser"],
        "user_create": ["core.permissions.SelfRegistrationOpen"],
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "UPDATE_LAST_LOGIN": True,  # so an import can tell which slips were already used
    "AUTH_HEADER_TYPES": ("JWT",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Finto API Docs",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "jwtAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "Authorization",
                "description": "Token format: JWT <your_token>",
            }
        }
    },
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
    },
    "SECURITY": [
        {"jwtAuth": []},
    ],
}

# Cloudinary: one variable, CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
_cloudinary_url = urlparse(os.environ.get("CLOUDINARY_URL", ""))
CLOUDINARY_STORAGE = {
    "CLOUD_NAME": _cloudinary_url.hostname,
    "API_KEY": _cloudinary_url.username,
    "API_SECRET": _cloudinary_url.password,
}

MEDIA_URL = "/media/"

# Logo shown in notification emails (optional). Upload any logo and paste its URL.
FINOT_LOGO_URL = os.environ.get("FINOT_LOGO_URL", "")

# Email (dev.py defaults to the console backend; prod.py defaults to SMTP)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT") or 587)
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL") or EMAIL_HOST_USER or "noreply@finot.local"
# The weekly donation named in the Thursday reminder (birr), and how many reminder emails one run may send
# (the free Brevo plan allows about 300 emails a day).
WEEKLY_DONATION_AMOUNT = int(os.environ.get("WEEKLY_DONATION_AMOUNT") or 10)
WEEKLY_REMINDER_EMAIL_LIMIT = int(os.environ.get("WEEKLY_REMINDER_EMAIL_LIMIT") or 300)

RETURN_URL = f"{FRONTEND_URL}/donation/success"
CALLBACK_URL = f"{PUBLIC_DOMAIN}/api/donations/verify/"

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": [
            "profile",
            "email",
        ],
        "AUTH_PARAMS": {
            "access_type": "online",
        },
        "OAUTH_PKCE_ENABLED": True,
    }
}

from config.unfold_config import UNFOLD  # noqa: F401, E402
