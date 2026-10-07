from .base import *

DEBUG = False

# Ensure SECRET_KEY is set in prod securely
if SECRET_KEY == "unsafe-dev-fallback-key":
    raise ValueError("SECRET_KEY must be set in production.")

# Strict security settings for Production
SECURE_SSL_REDIRECT = False
# Hosts such as Render terminate HTTPS in front of the app and tell it so with this header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
# Browsers remember to use HTTPS only. One week to start; raise to 31536000 (one year) once everything works.
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS") or 604800)
SECURE_CONTENT_TYPE_NOSNIFF = True

# We use whitenoise in prod for static assets
STORAGES = {
    "default": {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Legacy settings required by django-cloudinary-storage which hasn't fully updated to Django 5.1
DEFAULT_FILE_STORAGE = "cloudinary_storage.storage.MediaCloudinaryStorage"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Real email (SMTP settings come from base.py / .env)
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND") or "django.core.mail.backends.smtp.EmailBackend"

# Hosts / CORS / CSRF come only from env in production (no hard-coded domains).
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if PUBLIC_DOMAIN:
    ALLOWED_HOSTS.append(urlparse(PUBLIC_DOMAIN).netloc or PUBLIC_DOMAIN)
ALLOWED_HOSTS = list(set(ALLOWED_HOSTS))

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
if FRONTEND_URL:
    if FRONTEND_URL not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)
    if FRONTEND_URL not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(FRONTEND_URL)

WHITENOISE_MANIFEST_STRICT = False

