# Security notes

## Secrets

- No secret is stored in this repository. All of them are environment variables (see [configuration.md](configuration.md)). `.env` files are git-ignored; only the blank `.env.example` templates are committed.
- Paste secrets yourself into `.env` or into your host's settings. Do not paste them into chats, issues, commit messages or screenshots. If one leaks, **rotate it** (create a new key and delete the old one): removing it from a later commit does not remove it from history.
- Things that are secrets: `SECRET_KEY`, `DATABASE_URL`, `CLOUDINARY_URL`, `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `EMAIL_HOST_PASSWORD`, `FIREBASE_CREDENTIALS_B64`, `CRON_SECRET`.
- Not secrets (public by design, but still restrict them): the Firebase **web** config (it is downloaded by every browser; restrict the API key to your site in Google Cloud) and any `VITE_*` value.
- Use separate keys for test and live (Chapa) and for development and production (database, mail).

## Sample passwords

The development commands (`reset_dev_data`, `seed_people`, `seed_demo`, `create_students`) and the tests use sample passwords. They exist only to speed up local testing. Never run those commands against production and never reuse those passwords.

## Authentication and access

- JWT sign-in through Djoser; the access token lasts one day.
- Passwords must pass Django's validators; `create_first_admin` refuses weak ones.
- Every endpoint is permission-checked on the server (see [roles-and-permissions.md](roles-and-permissions.md)). Hiding a button in the website is never the protection.
- Default rate limits: 120 requests a minute per address for anonymous users and 120 per signed-in user (`THROTTLE_ANON`, `THROTTLE_USER`). Sign-in has its own limits: 10 attempts a minute for one account and 600 a minute for one address, so a whole campus behind one IP can sign in while one account cannot be guessed quickly.
- Students registered from a list get a printed slip (made-up email and random password) that works for a limited time (`ACCOUNT_SETUP_GRACE_DAYS`); afterwards every page except the Account page is closed until the student confirms a real email with a 6-digit code and chooses a new password. Only a keyed hash of the code is stored.
- Scheduled-job URLs need the `X-Cron-Token` header; a wrong or missing token gets a bare 404.
- Chapa webhooks are accepted only with a valid signature.

## Personal data

The platform stores names, emails, phone numbers, year of study and department, dorm details, photos, private questions and donations. In particular:

- **Private questions** are visible only to the asker, the counselors they are routed or assigned to, and the Super Admin. Moderators cannot read them. Personal-category questions reach a counselor only when the Super Admin assigns them.
- **Excel exports** contain personal information (especially the private Q&A log and the donations list). Only the Super Admin can download them, apart from the per-course attendance report (the coordinator of that course), the events list (an Event Manager gets only their own events) and event attendance (a Service Admin gets only their own group).
- Visitors may donate without giving a name or an email.
- Photos under `frontend/public/images` are shown on the public pages: make sure the people in them agreed.

## Uploads

Materials are validated by type and size (documents up to 10 MB, video up to 100 MB) and by content (a renamed file is refused). Links must use `http` or `https`.

## Before you go live

See the checklist in [deployment.md](deployment.md). In short: production settings, a real `SECRET_KEY`, HTTPS everywhere, live keys only in the host's environment, backups, and no sample accounts.

## Reporting a problem

Tell the project owner privately. Do not open a public issue with details of a vulnerability or any real personal data.
