# Finot backend

Django 5.2 + Django REST Framework API for the Finot platform. For the big picture see the [root README](../README.md) and [docs/architecture.md](../docs/architecture.md).

## Run it

```bash
cp .env.example .env     # fill in; see ../docs/configuration.md
uv sync
uv run python manage.py migrate
uv run python manage.py create_first_admin
uv run python manage.py runserver      # http://localhost:8000
```

Interactive API docs: `http://localhost:8000/api/docs/swagger/`.

## Test it

```bash
uv run pytest
```

## Layout

```
backend/
├── config/            settings (dev, prod), URLs
├── core/              users, roles, role rules, public overview
├── student/           profiles, departments, yearly rollover
├── service/           service groups, events, families
├── course/            curriculums, semester courses, enrolment, attendance
├── resources/         materials
├── questionanswer/    public and private Q&A, moderation, counselor routing
├── donation/          Chapa payments, donation reports, payment re-check
├── notifications/     in-app, email, push, SMS plumbing, reminders, alerts
├── analytics/         Super Admin console API and Excel exports
├── templates/ static/ admin theme
├── Dockerfile
└── pyproject.toml     dependencies (managed with uv)
```

Management commands live in each app's `management/commands/`. The useful ones are listed in [../docs/local-setup.md](../docs/local-setup.md).

## Production

Set `DJANGO_SETTINGS_MODULE=config.settings.prod` and the environment from [../docs/configuration.md](../docs/configuration.md); follow [../docs/deployment.md](../docs/deployment.md). The `Dockerfile` collects static files, migrates, and starts Gunicorn.
