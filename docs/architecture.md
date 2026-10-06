# Architecture

## The big picture

```
 Browser (students, admins, visitors)
        │  HTTPS
        ▼
 ┌──────────────────────┐        ┌────────────────────────────────────────────┐
 │ frontend (React SPA) │ ─────▶ │ backend (Django + DRF API)                  │
 │ Vite build, static   │  JSON  │  /api/...  /auth/...  /admin/  /api/docs/   │
 └──────────────────────┘        └───────┬──────────┬───────────┬─────────────┘
                                         │          │           │
                              PostgreSQL │   Cloudinary    Chapa │  SMTP email · Firebase push
                              (SQLite    │   (uploads)   (payments)   (notifications)
                               locally)  ▼
                                   data and files

 GitHub Actions ──(secret-protected HTTPS calls)──▶ backend   reminders, payment re-check
```

The frontend is a single-page app that talks to the backend only through the JSON API. There is no server-side rendering.

## Backend apps (Django)

| App | Responsibility |
|---|---|
| `core` | users, roles, role rules by year of study, public overview numbers, authentication helpers |
| `student` | student profile, departments, yearly rollover (promote and graduate), student information cards |
| `service` | service groups (admin, members, applicants), events and event attendance, families and the smart distribution |
| `course` | curriculums, semester courses (Not started / Open / Completed), automatic enrolment, class days, attendance, reports, who may manage a course |
| `resources` | materials (course, service group, general) with file and link validation |
| `questionanswer` | public and private questions, answers, moderation, counselor routing by category, assignments |
| `donation` | Chapa payments, student and visitor donations, verification, the re-check job, donation reports |
| `notifications` | in-app notifications, email, push, SMS plumbing, weekly and class reminders, moderator and counselor alerts |
| `analytics` | the Super Admin console API (`/api/admin-console/`) and the Excel exports (`/api/analytics/export/`) |
| `config` | settings (`dev`, `prod`), URLs |

### Notification design

Business apps never send messages themselves. They fire a Django **signal** (for example `payment_completed`, `question_answered`). The `notifications` app listens, and a **dispatcher** hands the event to every registered **channel** (in-app, email, push, SMS). A broken channel is logged and never stops the others or the request that caused the event.

```
domain app ──signal──▶ handler ──▶ dispatcher ──▶ in-app │ email │ push │ sms
```

### Permissions

Every endpoint checks permissions on the server; the front end only hides buttons. The rules live in small, tested modules:

- `core/role_rules.py`: which year of study each role needs
- `service/group_rules.py`: how a Service Admin comes from running a group
- `course/access.py`: a Course Coordinator manages only the courses where they are named
- `questionanswer/visibility.py`: which private question each counselor may see

See [roles-and-permissions.md](roles-and-permissions.md).

## Frontend (`frontend/src`)

| Folder | Contents |
|---|---|
| `pages/` | route-level screens (public pages, student dashboard pages, course and Q&A pages) |
| `features/admin-console/` | the Super Admin area (`/dashboard/admin/*`) |
| `features/` (others) | auth and role helpers, course attendance report, export button, service groups |
| `components/` | shared UI (cards, dialogs, filters, dashboard sidebar and top bar, notices) |
| `layouts/` | `MainLayout` (public pages) and `DashboardLayout` (signed-in area) |
| `lib/` | API client (`api.real.ts`), axios setup, i18n, date helpers |
| `assets/locales/` | `en.json`, `am.json`, `om.json` translations |
| `routes/` | the route table and role-based route guards |

Behaviour worth knowing:

- Signed-in users get a sidebar. On tablets it is an icon-only strip; on phones it is a drawer opened with the menu button.
- There are no browser pop-ups: confirmations use an in-page dialog and notices use toasts.
- All user-facing text goes through the translation files. Amharic and Oromo wording should be reviewed by native speakers.

## Data and time

- Dates are stored in UTC. Ethiopia has no daylight saving (UTC+3), so "tomorrow" for class reminders is computed at that fixed offset.
- A student's **year of study** (batch) drives course enrolment, role eligibility, and family distribution. Only a Super Admin changes it after the student sets it once.
