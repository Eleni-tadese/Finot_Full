# Finot

**A full-stack platform that runs a student fellowship: registration, roles, courses, attendance, mentorship families, private counseling, donations and notifications, in English, Amharic and Afaan Oromoo.**

Built for the **Gibi Gubae** student fellowship, where about a thousand new students join every year and the leaders used to run everything from paper lists, chat groups and spreadsheets.

| | |
|---|---|
| **Live website** | https://finot.pages.dev |
| **Live API health check** | https://finot-api.onrender.com/health/ (the free host sleeps; the first call can take a minute) |
| **Status** | In production since October 2026 |
| **Stack** | React 19 · TypeScript · Vite · Tailwind · Django 5.2 · Django REST Framework · PostgreSQL · Docker |

> This is a private repository. It holds no credentials: every secret is read from environment variables (see [docs/configuration.md](docs/configuration.md)).

## The problem

Student lists in many spreadsheets, attendance on paper, a thousand students to register by hand, mentorship families formed by guesswork, sensitive questions sent through personal chats, and leaders who change every year. Most students use a phone and many prefer Amharic or Afaan Oromoo.

## What Finot does

| Area | In short |
|---|---|
| **Bulk registration** | Print 1000 login slips in an afternoon (8 per page). A student signs in, writes their name, confirms a real email with a 6-digit code and chooses their own password before a deadline. Imports can be undone. |
| **People and roles** | Eight roles with rules that depend on the year of study (for example counselors need year 3+). Every rule is enforced on the server. |
| **Service groups** | Students apply with up to three choices; group admins accept applicants; a student can serve in at most two groups. |
| **Courses and attendance** | Curriculums are opened per semester, students of the matching year are enrolled automatically, coordinators take Present/Absent attendance on a phone, with reports and Excel export. |
| **Events** | General events for everyone and private events for one group, with email, in-app and push notices, and attendance. |
| **Mentorship families** | One-click distribution of first-years into mixed families, with preview, confirm and undo. Parents see their children; children reply to the parents. |
| **Questions and answers** | Moderated public questions, and private questions routed to the right counselor by category; sensitive ones wait for the Super Admin to assign. |
| **Donations** | Chapa payments for students and visitors, signed webhooks, an hourly re-check of pending payments, and reports. |
| **Notifications** | In-app, email and push through one dispatcher; Thursday donation reminder and "class tomorrow" reminder from scheduled jobs. SMS is built and switched off. |
| **Year progress** | One-click "start new year": promote everyone, graduate the last year, undo if needed. |
| **Reports** | Excel export of every table plus one file with everything. |
| **Languages** | English, Amharic and Afaan Oromoo, including the server's emails for the sign-up flow. |

## Architecture

```
 Browser ──HTTPS──▶ React single-page app (Cloudflare Pages)
                          │ JSON
                          ▼
                    Django REST API (Docker on Render)
                          │
      ┌───────────────┬───┴──────────┬────────────────┬───────────────┐
      ▼               ▼              ▼                ▼               ▼
 PostgreSQL       Cloudinary       Chapa         SMTP email      Firebase push
 (Neon)           (uploads)      (payments)       (Brevo)         (optional)

 GitHub Actions ──secret-protected HTTPS calls──▶ API   (reminders, payment re-check)
```

More in [docs/architecture.md](docs/architecture.md).

## Engineering highlights

- **Permissions in small tested modules.** Role rules, group rules, course access and private-question visibility each live in one file with their own tests. A test walks every endpoint as an anonymous visitor to make sure nothing leaks.
- **Signals and a dispatcher for notifications.** Business code fires an event; channels (in-app, email, push, SMS) subscribe. A broken channel never breaks the request.
- **Safe bulk operations.** Account import, family distribution and the yearly rollover all keep a batch record so they can be previewed and undone.
- **Built for a crowd on a weak server.** Slip sign-in uses a light password hash, sign-in limits are per account and per network address (a whole campus shares one address), and bulk emails go over one connection in a background thread.
- **No server clock.** Scheduled work is started by GitHub Actions calling secret-protected endpoints, so the free host can sleep.
- **Database integrity.** Uniqueness rules (one attendance row per student per class day, one family per student, one payment per donation) are database constraints, not only code checks. See [docs/database-design.md](docs/database-design.md).
- **Security pass.** Django 5.2 LTS, webhook signature check, closed API docs in production, HSTS, keyed hash for email codes, upload validation by content, credential scan before every export.
- **Responsive and translated.** An automated browser audit checks every page at six widths; a script proves every text exists in all three languages.
- **Continuous integration.** Backend tests, TypeScript check and production build run on every push.

## Specification documents

| Document | What it answers |
|---|---|
| [Product Requirements (PRD)](docs/product-requirements.md) | Why Finot exists, for whom, what is in scope, how success is measured |
| [Software Requirements Specification (SRS)](docs/software-requirements-specification.md) | What the system shall do: numbered, testable functional and non-functional requirements, with traceability to the code |
| [Database design](docs/database-design.md) | Tables, relations, constraints and ER diagrams |
| [Architecture](docs/architecture.md) | How the pieces fit together |
| [Roles and permissions](docs/roles-and-permissions.md) | Who can do what |
| [UX design brief](docs/ux-design-brief.md) | Interface principles and screens |

## Repository layout

```
Finot_Full/
├── frontend/   React + TypeScript + Vite single-page app
├── backend/    Django 5.2 + Django REST Framework API
├── docs/       Specifications, architecture, setup, configuration, roles, deployment, security, API
├── .github/    CI (tests, type check, build) and the scheduled reminder jobs
└── README.md
```

## Tech stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS, React Router 7, react-i18next, axios, framer-motion.
- **Backend:** Python 3.13, Django 5.2 LTS, Django REST Framework, Djoser + JWT, drf-spectacular (OpenAPI), WhiteNoise, Gunicorn, openpyxl (Excel). Dependencies are managed with [uv](https://docs.astral.sh/uv/).
- **Services:** PostgreSQL (SQLite fallback for local use), Cloudinary (media), Chapa (payments), SMTP email (Brevo), Firebase Cloud Messaging (push, optional), GitHub Actions (schedules).
- **Hosting:** Cloudflare Pages (website), Render (API, Docker), Neon (database), all on free tiers.

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
cd backend  && uv run pytest              # 458 tests
cd frontend && npx tsc -b && npm run build
```

More in [docs/testing.md](docs/testing.md).

## All documentation

Start at [docs/README.md](docs/README.md). Also useful:

- [Local setup](docs/local-setup.md) and [Configuration](docs/configuration.md)
- [Admin guide](docs/admin-guide.md) (how the project owner runs the platform)
- [Payments with Chapa](docs/payments-chapa.md)
- [Notifications and scheduled jobs](docs/notifications-and-reminders.md)
- [Deployment checklist](docs/deployment.md)
- [Security notes](docs/security.md)
- [API reference](docs/api.md)

## License

Private project. Not licensed for reuse or redistribution.
