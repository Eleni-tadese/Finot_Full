# Notifications and scheduled jobs

## What people are told

| Event | Who | Channels |
|---|---|---|
| Weekly donation reminder (Thursday) | every active student and graduate | in-app, **email**, push (and SMS if switched on) |
| "Class tomorrow" | students enrolled in an **Open** course with a class day tomorrow | in-app, push |
| Payment completed or failed | the donor | in-app, email, push |
| New event published | everyone for a general event; only that group's active members for a group event | in-app, email (with place, map link and description), push (and SMS if on) |
| Private question answered | the asker | in-app, push (and SMS if on) |
| New public question or answer to approve | every moderator (the Super Admin if there is none) | in-app, push |
| New private question | counselors who can see it; the Super Admin when nobody can (sensitive or unhandled category) | in-app, push |
| Private question assigned | that counselor | in-app, push |

Plus a card at **sign-in** for moderators, counselors and the Super Admin that says what is waiting (questions and answers to approve, public questions unanswered for over a week, private questions to answer, questions that need a counselor).

The bell refreshes every minute and when the browser tab is shown again. Q&A alerts open the right staff page.

## Weekly donation reminder

- Text: "Happy Thursday! Please remember to send your weekly fellowship donation of **10 birr** today." The amount comes from `WEEKLY_DONATION_AMOUNT` (default 10).
- The email uses the standard Finot email layout and has a **Give now** button to the donation page.
- The emails go through the email outbox (see below): one run queues one row per person and sends what the daily limit allows; the rest goes out with the 6-hourly job, and a row not sent within two days is skipped. Everybody still gets the in-app reminder at once.
- Addresses that can never receive mail (`@something.test`, `@example.com`, `.invalid`, no dot in the domain) are skipped, so sample accounts in a development database cannot cause bounces. Turn this off only in tests (`REMINDER_EMAIL_SKIP_UNDELIVERABLE = False`).
- All emails go over one SMTP connection. From the web trigger they are sent in a background thread so the request returns quickly. A mail problem never stops the in-app reminder.
- A second run within 6 days is skipped (add `--force` to the command to override).

## When is an event announced?

Once per event (`Event.announced_at`): when it is created, or, if it was created with a date that was already over
(nothing is announced for a finished event), at the first edit that moves it into the future. Later edits never announce
again. The announcement is the in-app alert, the phone push, the SMS (if switched on) and the email rows in the outbox.

## Email outbox (new event, event tomorrow, weekly reminder)

Bulk emails are not sent inside the web request any more. When an event is published, one row per person is written to
the **email outbox** (`notifications/outbox.py`, table `notifications_emailoutbox`), and the rows are sent in portions:

- **Daily limit**: Super Admin > Messages > Email (default 300, the free Brevo allowance; counted per UTC day).
- **Order**: the nearest event first. A row whose event has already started is marked *skipped* instead of sent.
- **Failures**: a row is retried on the next run, three times, then stays *failed* with the error text; the Super Admin can
  put the failed rows back with **Retry failed**. Five failures in a row stop the run (the mail provider is probably down).
- **Event tomorrow**: the job also finds events that start tomorrow (Ethiopia time) and gives everyone the event is for an
  in-app reminder plus one email row, once per event (`Event.reminder_sent_at`).
- The same job closes forgotten attendance sessions (`close_stale_attendance_sessions`).

## Scheduled jobs

The server does not run its own scheduler. Three free GitHub Actions workflows call secret-protected URLs:

| Workflow (`.github/workflows/`) | When | Calls |
|---|---|---|
| `weekly-reminders.yml` | Thursday 09:00 Ethiopia time | `POST /api/notifications/cron/weekly-reminders/` |
| `class-reminders.yml` | daily 18:00 Ethiopia time | `POST /api/notifications/cron/class-reminders/` |
| `email-outbox.yml` | every 6 hours | `POST /api/notifications/cron/email-outbox/` (attendance auto-close, event-tomorrow reminders, send the outbox) |
| `verify-donations.yml` | hourly | `POST /api/donations/cron/verify-pending/` |

How a schedule works: GitHub's clock starts the workflow at the set time (the times above are UTC converted to Ethiopia time, UTC+3), the workflow calls the backend address with the secret, and the backend does the work. The server needs no clock of its own. If the server is asleep the call wakes it (the call waits up to 5 minutes).

Each call must carry the header `X-Cron-Token: <CRON_SECRET>`. A wrong or missing token gets a plain 404, so strangers cannot trigger anything. Switch them on by setting `CRON_SECRET` in the backend and the repository secrets `CRON_SECRET` and `BACKEND_URL` (see [configuration.md](configuration.md)). Use **Actions → the workflow → Run workflow** to test; run the weekly one twice: the second answer says `skipped`.

Local equivalents (no GitHub needed):

```bash
# check that mail works: ONE reminder email to ONE address, nobody else is notified, nothing is recorded
uv run python manage.py send_weekly_reminders --test-email you@example.org

# the real thing (with real SMTP settings this sends real emails to every student with a real address)
uv run python manage.py send_weekly_reminders --force
uv run python manage.py send_class_reminders --today 2026-10-05
uv run python manage.py verify_pending_donations
```

`--today` pretends it is that date and announces classes planned for the next day. Each class day is announced once; moving a class day's date announces it again. A class planned for tomorrow after the 18:00 run gets no reminder.

## Push notifications

Optional. Needs a Firebase project: the service-account JSON (base64) in `FIREBASE_CREDENTIALS_B64` on the backend, and the web config plus VAPID key on the frontend (see [configuration.md](configuration.md)). Without them push is simply disabled.

## SMS

Built but off, and free while off. See [sms-notifications.md](sms-notifications.md).
