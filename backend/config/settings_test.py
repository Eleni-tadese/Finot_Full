from .settings.base import *

# Enforce SQLite for testing so it doesn't touch the production/development data
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Make tests run significantly faster by using a simpler password hasher
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# The suite makes hundreds of requests inside one minute. The rate limits (30 and 42 a minute by default) are for
# real visitors; leaving them on makes the tests fail on any machine that has no .env raising them.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}
