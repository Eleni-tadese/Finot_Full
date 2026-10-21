# Configuration

All configuration is read from **environment variables**. Nothing secret is stored in the code or in this repository. Copy the example file, fill it in, and keep the copy private.

- Backend: `backend/.env` (template: `backend/.env.example`)
- Frontend: `frontend/.env` (template: `frontend/.env.example`; only variables starting with `VITE_` reach the browser, so never put a secret there)
- Production: set the same names in your hosting provider's environment settings instead of a file.

## Backend

| Variable | Needed | Meaning |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | production | `config.settings.dev` locally (default), `config.settings.prod` in production |
| `SECRET_KEY` | yes | long random string; production refuses to start without a real one |
| `DEBUG` | dev only | `True` / `False`; production is always `False` |
| `ALLOWED_HOSTS` | production | comma-separated host names the backend serves |
| `CORS_ALLOWED_ORIGINS` | production | frontend origins allowed to call the API (scheme + host, no trailing slash) |
| `CSRF_TRUSTED_ORIGINS` | production | same format; origins trusted for CSRF |
| `FRONTEND_URL` | yes | where the React app runs; used for payment return links, email links, password reset and CORS |
| `PUBLIC_DOMAIN` | yes | public URL of this backend; used for the Chapa callback address |
| `DATABASE_URL` | production | `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`; empty means local SQLite |
| `CLOUDINARY_URL` | for uploads | `cloudinary://<api_key>:<api_secret>@<cloud_name>`; profile photos, group photos and materials |
| `FINOT_LOGO_URL` | optional | logo shown in notification emails |
| `CHAPA_SECRET_KEY` | for payments | the **private** Chapa key (test key while testing) |
| `CHAPA_API_BASE_URL` | optional | leave empty for `https://api.chapa.global/v1` |
| `CHAPA_WEBHOOK_SECRET` | optional | webhook signing secret; if empty, `CHAPA_SECRET_KEY` is used |
| `EMAIL_BACKEND` | optional | console backend in dev; `django.core.mail.backends.smtp.EmailBackend` for real mail |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | for real mail | SMTP account (for example Brevo) |
| `DEFAULT_FROM_EMAIL` | optional | "from" address; defaults to `EMAIL_HOST_USER` |
| `FIREBASE_CREDENTIALS_B64` | optional | Firebase service-account JSON, base64-encoded; empty disables push |
| `GOOGLE_APPLICATION_CREDENTIALS` | optional | alternative: path to the service-account file |
| `THROTTLE_ANON`, `THROTTLE_USER` | optional | rate limits per address / per signed-in user, for example `120/minute` (defaults: 120 and 120; many students share one campus address) |
| `SELF_REGISTRATION_OPEN` | optional | `true` lets visitors create their own account; empty (default) means accounts come only from the organization's printed slips and the public sign-up call is refused |
| `THROTTLE_LOGIN_IP`, `THROTTLE_LOGIN_USER` | optional | sign-in limits: per address (default `600/minute`) and per account (default `10/minute`) |
| `NUM_PROXIES` | on a host | how many proxies sit in front of the app (Render: `1`), so the visitor's real address is used for the limits |
| `WEB_CONCURRENCY`, `GUNICORN_THREADS` | optional | gunicorn workers (default 2) and threads per worker (default 4) |
| `ACCOUNT_SETUP_GRACE_DAYS` | optional | days a bulk-registered student may use the printed slip (default 21) |
| `CRON_SECRET` | for schedules | long random string; the GitHub workflows send it as `X-Cron-Token`. Empty disables the scheduled triggers |
| `WEEKLY_DONATION_AMOUNT` | optional | amount (birr) named in the Thursday reminder; default `10` |
| `EVENT_EMAIL_LIMIT` | optional | most emails one new event may send; default `300` |

## Frontend

| Variable | Needed | Meaning |
|---|---|---|
| `VITE_API_URL` | yes | base URL of the backend, no trailing slash |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | optional | Firebase web app config for push |
| `VITE_FIREBASE_VAPID_KEY` | optional | Firebase "Web Push certificates" key |

The browser push service worker (`frontend/public/firebase-messaging-sw.js`) cannot read environment variables, so the Firebase **web** config is written inside that file. Firebase web configuration is not a secret (every visitor's browser downloads it), but you should restrict the API key to your site in the Google Cloud console. Replace the values in that file with your own Firebase project's.

## GitHub Actions secrets

Set in the repository: **Settings → Secrets and variables → Actions**.

| Secret | Value |
|---|---|
| `CRON_SECRET` | the same value as the backend's `CRON_SECRET` |
| `BACKEND_URL` | the public backend address, for example `https://api.example.org` (no trailing slash) |

## Settings in the database (not environment variables)

- **SMS**: on/off switch and monthly limit, in the Django admin (Notifications → SMS configuration) and in the Super Admin console (SMS page).
- **Selection window** for service groups: a switch in the Super Admin console (Service groups).
