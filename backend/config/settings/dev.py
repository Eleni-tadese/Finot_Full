from .base import *

DEBUG = env_bool("DEBUG", True)

STORAGES = {
    "default": {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Legacy settings required by django-cloudinary-storage which hasn't fully updated to Django 5.1
DEFAULT_FILE_STORAGE = "cloudinary_storage.storage.MediaCloudinaryStorage"
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.StaticFilesStorage"

# Console email backend by default (prints emails in the runserver terminal).
# Set EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend in .env for real SMTP.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND") or "django.core.mail.backends.console.EmailBackend"

# Hosts / CORS / CSRF come from .env (comma-separated). FRONTEND_URL and PUBLIC_DOMAIN
# are always included so a minimal .env works.
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS") or ["localhost", "127.0.0.1"]

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
for _origin in (FRONTEND_URL, PUBLIC_DOMAIN):
    if _origin:
        if _origin not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(_origin)
        if _origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(_origin)
