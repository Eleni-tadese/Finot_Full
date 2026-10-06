# Local setup

## Requirements

- Python 3.13 and [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js 20 or newer
- Optional services (the app starts without them): a PostgreSQL database, a Cloudinary account, a Chapa test account, an SMTP account, a Firebase project

## 1. Backend

```bash
cd backend
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
```

Fill in `.env`. A minimal local file needs only:

```
SECRET_KEY=<a long random string>
FRONTEND_URL=http://localhost:5176
PUBLIC_DOMAIN=http://localhost:8000
```

Generate a key with `python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"`. Without `DATABASE_URL` the backend uses a local SQLite file. Uploads (photos, materials) need `CLOUDINARY_URL`. Payments need `CHAPA_SECRET_KEY` (a **test** key). See [configuration.md](configuration.md).

```bash
uv sync                                   # install dependencies
uv run python manage.py migrate           # create the tables
uv run python manage.py create_first_admin
uv run python manage.py runserver         # http://localhost:8000
```

`create_first_admin` asks for your own email, names, gender and password (hidden, typed twice). It refuses weak passwords and refuses to run again once a Super Admin exists.

Emails print in the terminal by default (console email backend). To see Chapa and email behave like production, set the real values in `.env`.

Interactive API documentation: <http://localhost:8000/api/docs/swagger/> (OpenAPI schema at `/api/schema/`).

## 2. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL=http://localhost:8000
npm install
npm run dev               # http://localhost:5176
```

## 3. Sign in and build the organization

Log in at <http://localhost:5176/login> with the Super Admin you created (the login field holds the email). From there:

1. People register themselves at `/register`, and set their year of study and department once in their profile.
2. In **Users & roles** the Super Admin gives roles.
3. Create service groups, courses, families and so on. The order is in the [admin guide](admin-guide.md).

## Handy commands

| Command (in `backend/`) | What it does |
|---|---|
| `uv run python manage.py create_first_admin` | first Super Admin (interactive) |
| `uv run python manage.py reset_dev_data --yes --empty` | **deletes all data in the configured database**; development only |
| `uv run python manage.py reset_dev_data --yes` | wipes the database and creates sample roles and an admin (development only; sample passwords) |
| `uv run python manage.py create_students --start 1 --count 30 --password <pw>` | creates sample students spread over years and departments |
| `uv run python manage.py seed_people` / `seed_demo` | sample people / demo data (development only) |
| `uv run python manage.py send_weekly_reminders --test-email you@example.org` | send ONE reminder email to ONE address to check that mail works |
| `uv run python manage.py send_weekly_reminders [--force]` | send the Thursday donation reminder now to everyone (real emails if SMTP is configured) |
| `uv run python manage.py send_class_reminders [--today YYYY-MM-DD] [--force]` | send "class tomorrow" reminders now |
| `uv run python manage.py verify_pending_donations` | ask Chapa about pending payments and settle them |
| `uv run python manage.py sync_course_enrolments [--yes]` | show or repair course enrolments (dry run without `--yes`) |

> The `reset_dev_data`, `seed_*` and `create_students` commands exist for development. Never run them against a production database, and never reuse the sample passwords they print.

## Troubleshooting

- **"could not translate host name" / "server closed the connection" with a hosted database:** the free database may be asleep. Open its console and run `select 1;` or retry in a minute.
- **CORS error in the browser:** `FRONTEND_URL` (or `CORS_ALLOWED_ORIGINS`) in the backend `.env` must match the address the frontend runs on, with no trailing slash.
- **Chapa does not send the donor back to the site on localhost:** Chapa only accepts `https` return addresses. See [payments-chapa.md](payments-chapa.md).
