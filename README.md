# Finot

A web platform for the **Gibi Gubae** student fellowship: students, service groups, courses, events, mentorship families, donations and anonymous spiritual counseling, managed from one place.

> This is a private repository. It holds no credentials: every secret is read from environment variables (see [docs/configuration.md](docs/configuration.md)).

## What it does

| Area | In short |
|---|---|
| **People and roles** | Students register themselves. A Super Admin gives roles (Service Admin, Event Manager, Course Coordinator, Family Admin, QA Counselor, QA Moderator). Role rules depend on the year of study. |
| **Service groups** | Groups with their own admin, applicants, members and student-facing page. A student can belong to up to two groups. |
| **Courses** | Curriculums are opened per semester; students of the matching year are enrolled automatically. Coordinators plan class days, take Present/Absent attendance, upload materials and start/complete the course. Students see their courses, attendance and materials. |
| **Events** | Like a channel: an Event Manager announces general events to everyone (what, when, where, what to bring) and takes their attendance; a Service Admin does the same for events of their own group, which only that group sees. Notification and email for every event. Students see their events and their own attendance. |
| **Families** | Mentorship families with a father and mother; smart distribution of first-year students (preview, confirm, undo). |
| **Questions and answers** | Public questions (moderated) and private questions routed to counselors by category, with alerts and a one-week "unanswered" check. |
| **Donations** | Chapa payments. Signed-in students give their weekly donation; visitors simply support the fellowship. Super Admin donations page and Excel export. |
| **Notifications** | In-app, email and push; weekly donation reminder (Thursday), "class tomorrow" reminder, moderator and counselor alerts. SMS is built but off. |
| **Year progress** | Departments with program length, one-click "start new year" rollover with undo, graduates keep their account. |
| **Reports** | Excel export of students, families, events, attendance, private Q&A log, donations and course attendance reports. |
| **Languages** | English, Amharic and Afaan Oromoo. |

## Repository layout

```
Finot_Full/
├── frontend/   React + TypeScript + Vite single-page app
├── backend/    Django 5.1 + Django REST Framework API
├── docs/       Architecture, setup, configuration, roles, deployment, security, API list
├── .github/    CI (tests, type check, build) and the scheduled reminder jobs
└── README.md
```

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, react-i18next, axios, framer-motion.
- **Backend:** Python 3.13, Django 5.1, Django REST Framework, Djoser + JWT, drf-spectacular (OpenAPI), WhiteNoise, Gunicorn. Dependencies are managed with [uv](https://docs.astral.sh/uv/).
- **Services:** PostgreSQL (SQLite fallback for local use), Cloudinary (media), Chapa (payments), SMTP email (for example Brevo), Firebase Cloud Messaging (push, optional), GitHub Actions (schedules).

## Quick start (local)

You need Python 3.13 with `uv`, Node.js 20+ and a copy of the two example environment files.

```bash
# 1) Backend  (http://localhost:8000)
cd backend
cp .env.example .env            # then fill in the values you need (see docs/configuration.md)
uv sync
uv run python manage.py migrate
uv run python manage.py create_first_admin     # asks for your own details; creates the first Super Admin
uv run python manage.py runserver

# 2) Frontend  (http://localhost:5176)
cd frontend
cp .env.example .env            # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Everything else (people, roles, groups, courses, families) is created from the website, starting with the Super Admin. A full walk-through is in [docs/local-setup.md](docs/local-setup.md) and [docs/admin-guide.md](docs/admin-guide.md).

## Tests and checks

```bash
cd backend  && uv run pytest              # more than 330 tests
cd frontend && npx tsc -b && npm run build
```

More in [docs/testing.md](docs/testing.md).

## Documentation

Start at [docs/README.md](docs/README.md). The most useful pages:

- [Architecture](docs/architecture.md)
- [Local setup](docs/local-setup.md) and [Configuration](docs/configuration.md)
- [Roles and permissions](docs/roles-and-permissions.md)
- [Admin guide](docs/admin-guide.md) (how the project owner runs the platform)
- [Payments with Chapa](docs/payments-chapa.md)
- [Notifications and scheduled jobs](docs/notifications-and-reminders.md)
- [Deployment checklist](docs/deployment.md)
- [Security notes](docs/security.md)
- [API reference](docs/api.md)

## License

Private project. Not licensed for reuse or redistribution.
