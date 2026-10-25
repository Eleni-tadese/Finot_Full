# Deployment guide

Finot is two deployables, plus services around them:

```
 Students ──▶ Frontend  (static site)  ──▶ Backend (Docker web service) ──▶ Neon PostgreSQL
                                                │        │       │
                                           Cloudinary   Chapa   SMTP mail
 GitHub Actions ──(hourly / daily / weekly secret calls)──▶ Backend
```

## Recommended free setup

| Part | Service | Why | Watch out for |
|---|---|---|---|
| Frontend | **Cloudflare Pages** (connected to this repo) | free static hosting that builds on every push; preview address for non-production branches; single-page-app routing handled by `frontend/public/_redirects` | free plan: 500 builds a month, 20,000 files per site. Read Cloudflare's terms to confirm your use is covered |
| Backend | **Render** web service, runtime Docker (the `backend/Dockerfile` is used as is) | deploys from GitHub, free instance available | a free instance **sleeps after 15 minutes without traffic** and takes about a minute to wake; free instances have a monthly hour allowance |
| Database | **Neon** PostgreSQL (a *new* project for production) | already used in development | the free compute also sleeps when idle; the first request after a pause is slower |
| Media | Cloudinary | uploaded photos and materials | |
| Email | an SMTP provider such as Brevo | receipts, reminders | free plans have a daily email limit (about 300 on Brevo's free plan) |
| Schedules | GitHub Actions (already in `.github/workflows`) | reminders and payment re-check | needs two repository secrets |

> **Do not use Vercel's free (Hobby) plan for this project.** It is limited to non-commercial personal use, and Vercel counts taking payments as commercial. Finot takes donations. Cloudflare Pages, or a paid Vercel plan, are the alternatives.

Free tiers change. Check each provider's current pricing page before you rely on a limit.

## How a change goes live

- `main` is **production**. Every push to `main` rebuilds and publishes the live site.
- `dev` is where work happens. Pushing to `dev` runs the tests (CI) but does **not** change the live site. Cloudflare Pages also publishes a preview of `dev` at its own address.
- To release: test on `dev`, then merge `dev` into `main` (a pull request, or a fast-forward merge) and push. The host redeploys.
- To roll back: in the host's dashboard redeploy the previous successful deploy, then fix the problem on `dev`.
- On Render, if the setting "Auto-Deploy" offers **After CI Checks Pass**, choose it, so a broken build never goes live.

## Step by step

### 0. Gather accounts (all free to create)

GitHub (you have it), Neon, Render, Cloudflare, Cloudinary, an SMTP provider, Chapa. Keep every key in a password manager. Never paste keys into chats, issues or commits.

### 1. Database (Neon)

1. Create a **new project** for production, for example `finot-prod`, in a region close to the Render region you will pick (Europe works well for Ethiopia).
2. Copy the connection string (it looks like `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`). This is your `DATABASE_URL`. Treat it as a password.

### 2. Backend (Render)

1. Render → **New → Web Service** → connect the `Finot_Full` repository.
2. Settings:
   - **Name:** `finot-api` (the address becomes `https://finot-api.onrender.com`; if the name is taken, Render adds a suffix; use the address Render shows)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Docker (detected from the `Dockerfile`)
   - **Instance type:** Free
   - **Health Check Path:** `/health/`
   - **Auto-Deploy:** *After CI Checks Pass* if offered, otherwise *On Commit*
3. Environment variables (see [configuration.md](configuration.md) for all of them):

   | Name | Value |
   |---|---|
   | `SECRET_KEY` | a new long random string (`python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"`) |
   | `DATABASE_URL` | from step 1 |
   | `PUBLIC_DOMAIN` | the backend's address, `https://finot-api.onrender.com` |
   | `FRONTEND_URL` | the frontend's address from step 3 (use the address you will get, for example `https://finot.pages.dev`; fix it after step 3 if it differs) |
   | `ALLOWED_HOSTS` | `finot-api.onrender.com` |
   | `CORS_ALLOWED_ORIGINS` | same as `FRONTEND_URL` |
   | `CSRF_TRUSTED_ORIGINS` | same as `FRONTEND_URL` |
   | `CLOUDINARY_URL` | from Cloudinary |
   | `CHAPA_SECRET_KEY` | your Chapa **test** key at first |
   | `EMAIL_BACKEND` | `notifications.brevo_backend.BrevoEmailBackend` (sends through Brevo's web API; **free Render blocks the normal mail ports 25, 465 and 587**, so SMTP does not work there) |
   | `BREVO_API_KEY` | an API key from Brevo (SMTP & API → API keys) |
   | `DEFAULT_FROM_EMAIL` | a sender address you verified in Brevo, for example `Finot <you@example.com>` |
   | *(on a paid Render plan or another host)* | you may use plain SMTP instead: `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` with `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` |
   | `CRON_SECRET` | a new long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
   | `NUM_PROXIES` | `1` (Render sits in front of the app; sign-in limits then count each visitor's real address) |
   | `SECURE_HSTS_SECONDS` | optional; default one week. Raise to `31536000` (one year) once everything works over HTTPS |
   | `API_DOCS_PUBLIC` | optional; leave unset. Set to `1` only if you want the API documentation pages (`/api/docs/swagger/`) to be public; they are closed in production by default |

   `DJANGO_SETTINGS_MODULE` is already `config.settings.prod` inside the Docker image.
4. **Create Web Service.** The first start collects static files, runs the database migrations, and starts the server. Watch the **Logs** tab. When it is live, open `https://<your-backend>/health/`: you should see `{"status":"ok"}`. (The API documentation pages are closed in production unless `API_DOCS_PUBLIC` is set.)

### 3. Frontend (Cloudflare Pages)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choose `Finot_Full`.
2. Settings:
   - **Project name:** `finot` (address `https://finot.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory (advanced):** `frontend`
   - **Environment variables:** `VITE_API_URL` = the backend address from step 2 (no trailing slash); `NODE_VERSION` = `20`
3. **Save and Deploy.** When it finishes, open the address. If its address differs from the one you typed into the backend's `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`, change those three in Render (it redeploys).
4. Optional: add your own domain under the project's *Custom domains*, then use that domain in the three backend variables.

### 4. Create the owner's Super Admin

Render's free plan has no shell, so create the first admin from your own computer, **pointing at the production database for this one command only**:

```powershell
cd backend
$env:DATABASE_URL = "<paste the production DATABASE_URL here>"
uv run python manage.py create_first_admin
Remove-Item Env:DATABASE_URL
```

The command asks for the owner's email and a strong password (typed twice, hidden). Do not save the URL in `.env`. Then sign in on the live site.

### 5. Payments (Chapa)

- Keep the **test** key for a first full test on the live site (donate with a Chapa test number; the donor should land back on `/donation/success`).
- In the Chapa dashboard set the webhook to `https://<your-backend>/api/donations/webhook/`.
- Decide who pays Chapa's fee.
- When everything works, replace `CHAPA_SECRET_KEY` with the **live** key in Render and make one small real donation to check.

### 6. Scheduled jobs

GitHub → the repository → **Settings → Secrets and variables → Actions** → add `CRON_SECRET` (the same value as in Render) and `BACKEND_URL` (the backend address, no trailing slash). Then **Actions → each workflow → Run workflow**: *Re-check pending donations*, *Weekly donation reminder* (run it twice: the second answer says `skipped`), *Class reminders*. A free Render instance that is asleep takes about a minute to wake when called; the workflows wait for it.

### 7. Smoke test on the live site

- [ ] Register a test student, set year and department, sign in.
- [ ] Super Admin: give a role; open Donations, Courses, Private Q&A.
- [ ] Upload a profile photo (tests Cloudinary).
- [ ] A donation with Chapa test mode completes and shows in **Admin → Donations**.
- [ ] A receipt email arrives (tests mail).
- [ ] Switch the language; refresh a deep page such as `/dashboard/profile` (tests the single-page routing).
- [ ] Delete the test student's data if you used a real database (or use a staging database for this test).

## Keeping the free backend awake (optional)

A sleeping instance is slow for the first visitor. A free uptime monitor that opens `https://<your-backend>/health/` every 10 minutes keeps it awake. A single always-on free instance uses about 744 hours a month, which fits the usual 750-hour allowance only while it is your **only** free service. Alternatively pay for the cheapest always-on instance when real students depend on it.

## Before you announce it

- [ ] Real SMTP settings; a test email received.
- [ ] Firebase push configured, or consciously left off.
- [ ] Native-speaker review of the Amharic and Oromo text.
- [ ] The "About" page claims (for example founding year and years of fellowship) confirmed by the owner.
- [ ] SMS: decide with the leadership ([sms-notifications.md](sms-notifications.md)); it is off and free until then.
- [ ] No sample accounts or sample passwords; never run `reset_dev_data`, `seed_*` or `create_students` on production.
- [ ] Database backups enabled in Neon; know how to restore.
- [ ] Live Chapa key only in Render, never in code.
- [ ] Read [security.md](security.md).

## Known limits to plan for

- Free backend and database instances sleep when idle; the first request after a pause is slow.
- The free mail plan caps daily emails: every bulk email (weekly reminder, event announcements, event-tomorrow reminders) goes through the email outbox with a daily limit (Super Admin > Messages > Email, default 300).
- GitHub scheduled workflows can start a few minutes late (more when GitHub is busy). They run from the repository's **default branch** (`main`), so a change to a workflow only takes effect after it is merged into `main`. GitHub documents that it pauses scheduled workflows after 60 days without repository activity for **public** repositories; yours is private, but look at the Actions tab if a job ever stops. A failed run is not retried by itself: re-run it from the Actions tab (the once-a-week guard prevents duplicates).
- The container applies database migrations on every start. Take a database backup before a risky release.
- If you run a migration by hand against the database that the live service uses, deploy the matching code right away. A migration that adds a required (NOT NULL) column without a database default makes the old code fail on every insert into that table until the new code is live.
