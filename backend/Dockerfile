# Use official Python image
FROM python:3.13-slim


WORKDIR /app


RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    mailcap \
    && rm -rf /var/lib/apt/lists/*



RUN pip install --upgrade pip && pip install uv

COPY pyproject.toml uv.lock /app/
RUN uv pip install --system --no-cache-dir -e .
COPY . /app/


ENV DJANGO_SETTINGS_MODULE=config.settings.prod
ENV PYTHONUNBUFFERED=1

# Collect the static files once, while the image is built, so a free server that wakes from sleep only has to run
# migrate and start (the key below is a throw-away value used only for this step; no secrets are needed to build).
RUN SECRET_KEY=build-only-not-used python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["bash", "-c", "python manage.py migrate && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --threads ${GUNICORN_THREADS:-4} --timeout 120"]