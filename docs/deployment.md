# Deployment checklist

Finot is two deployables: the **backend** (a Python web service with a PostgreSQL database) and the **frontend** (static files). Any host that runs a Python web process and serves static files will do. The repository includes a `backend/Dockerfile` and a `frontend/vercel.json` (single-page-app rewrite) as starting points.

## 1. Accounts you need

| Service | For | Notes |
|---|---|---|
| PostgreSQL host (for example Neon) | the database | free plans may sleep after a few idle minutes |
| Cloudinary | uploaded photos and materials | for PDF/ZIP delivery enable "PDF and ZIP files delivery" in Cloudinary's security settings |
| Chapa | payments | create **live** keys only when you are ready |
| SMTP provider (for example Brevo) | email | mind the daily limit of the plan |
| Firebase (optional) | push notifications | |
| GitHub | code and the scheduled jobs | |

## 2. Backend

1. Build from `backend/` (the `Dockerfile` installs dependencies with `uv`, runs `collectstatic` and `migrate`, then starts Gunicorn on `$PORT`).
2. Set the environment (see [configuration.md](configuration.md)). **Required in production:**
   - `DJANGO_SETTINGS_MODULE=config.settings.prod` (the default is the dev settings!)
   - `SECRET_KEY` (a real one; production refuses to start otherwise)
   - `DATABASE_URL`, `ALLOWED_HOSTS`, `FRONTEND_URL`, `PUBLIC_DOMAIN` (both `https://`), `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`
   - `CLOUDINARY_URL`, `CHAPA_SECRET_KEY`, the SMTP variables, `CRON_SECRET`
3. After the first deploy: `python manage.py create_first_admin` (once) to create the owner's Super Admin.
4. Check `https://<backend>/api/docs/swagger/` loads.

## 3. Frontend

1. Set `VITE_API_URL` to the backend's public address and (optionally) the Firebase variables.
2. Build: `npm ci && npm run build`; publish the `dist/` folder. The host must rewrite all paths to `index.html` (`vercel.json` does this).
3. Put the frontend's address into the backend's `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

## 4. Payments (Chapa)

- Both `FRONTEND_URL` and `PUBLIC_DOMAIN` must start with `https://`, otherwise Chapa will not send donors back (see [payments-chapa.md](payments-chapa.md)).
- In the Chapa dashboard set the webhook to `<PUBLIC_DOMAIN>/api/donations/webhook/`.
- Decide who pays Chapa's processing fee.
- Switch to the live key last, and make one real small donation to test. Never use a test key in production or a live key in development.

## 5. Scheduled jobs

Add the repository secrets `CRON_SECRET` (same as the backend) and `BACKEND_URL`. Then run each workflow once by hand (**Actions → Run workflow**): weekly reminders, class reminders, verify donations. See [notifications-and-reminders.md](notifications-and-reminders.md).

## 6. Before you announce it

- [ ] Real SMTP settings; send yourself a test (donation receipt or password reset).
- [ ] Firebase push configured, or consciously left off.
- [ ] Native-speaker review of the Amharic and Oromo text.
- [ ] The "About" page claims (for example founding year and years of fellowship) confirmed by the owner.
- [ ] SMS: decide with the leadership ([sms-notifications.md](sms-notifications.md)); it is off and free until then.
- [ ] Remove or change every sample password; never run the `reset_dev_data`, `seed_*` or `create_students` commands against production.
- [ ] Backups: enable the database provider's backups.
- [ ] Look at [security.md](security.md).

## Known limits to plan for

- The free database tier may wake slowly after idle time; the first request can be slow.
- The free Brevo plan sends about 300 emails a day: the weekly reminder email is capped by `WEEKLY_REMINDER_EMAIL_LIMIT`.
- GitHub scheduled workflows can start a few minutes late, and are paused by GitHub if the repository is inactive for about 60 days (re-enable them under Actions).
