# Software Requirements Specification (SRS)

| | |
|---|---|
| **System** | Finot, the Gibi Gubae fellowship platform |
| **Version** | 1.0 |
| **Style** | Based on the structure of IEEE 830 / ISO 29148 |
| **Related** | [PRD](product-requirements.md) (why and for whom) · [Database design](database-design.md) · [Architecture](architecture.md) · [Roles and permissions](roles-and-permissions.md) · [Testing](testing.md) |

Requirement words: **shall** = mandatory; **should** = expected; **may** = optional. Every requirement has an ID so a test or a code module can point to it.

---

## 1. Introduction

### 1.1 Purpose
This document states what the Finot system shall do and the qualities it shall have, so that it can be built, tested, reviewed and maintained.

### 1.2 Scope
Finot is a web application with a JSON API. It manages students, roles, service groups, events, courses, attendance, mentorship families, questions and answers, donations, notifications and reports for a student fellowship. It does not include a mobile app or an SMS provider contract.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Gibi Gubae** | The Orthodox Christian student fellowship that uses the system |
| **Batch / year of study** | A student's year (1 to 5, depends on the department) |
| **Service group (Ageglot)** | A ministry group students serve in |
| **Slip** | A printed sheet with a temporary login and password for a newly registered student |
| **Rollover** | The yearly step that moves every student up one year and graduates the last year |
| **Counselor** | A person who answers private questions in a field |
| **Chapa** | The Ethiopian online payment gateway |
| **JWT** | JSON Web Token used to keep a user signed in |

### 1.4 References
[Architecture](architecture.md) · [Configuration](configuration.md) · [Security notes](security.md) · [API reference](api.md) and the generated [endpoint list](api-endpoints.md) · live Swagger UI at `/api/docs/swagger/` (on a development server).

---

## 2. Overall description

### 2.1 Product perspective
A three-part system:

```
Browser ──HTTPS──▶ Frontend (React single-page app, static files on Cloudflare Pages)
                          │ JSON over HTTPS
                          ▼
                   Backend (Django REST API in a Docker container on Render)
                          │
        ┌─────────────────┼──────────────┬───────────────┬──────────────┐
        ▼                 ▼              ▼               ▼              ▼
   PostgreSQL         Cloudinary       Chapa        SMTP email     Firebase push
   (Neon)             (uploads)      (payments)     (Brevo)        (optional)
                          ▲
                GitHub Actions (scheduled, secret-protected calls)
```

### 2.2 User classes
Student, Super Admin, Service Admin, Event Manager, Course Coordinator, Family Admin, QA Moderator, QA Counselor, family father or mother, and Visitor (not signed in). See the [PRD personas](product-requirements.md#4-users-and-personas) and [roles-and-permissions.md](roles-and-permissions.md).

### 2.3 Operating environment
- **Clients:** current Chrome, Edge, Firefox and Safari on phone, tablet and desktop (320 px width and up).
- **Server:** Python 3.13, Django 5.2 LTS, Django REST Framework, Gunicorn (2 workers × 4 threads), PostgreSQL.
- **Time zone:** the server uses `Africa/Addis_Ababa` (UTC+3, no daylight saving); times are stored in UTC.

### 2.4 Constraints
- Free hosting tiers (cold start, limited CPU, outbound mail ports 25/465/587 blocked).
- Chapa accepts only `https` return and callback addresses.
- The platform stores personal data of students and must follow the privacy rules in section 5.3.

### 2.5 Assumptions
- Every user has a phone or a computer with a browser and internet access.
- The organization registers students; the public cannot self-register (`SELF_REGISTRATION_OPEN` is closed by default).
- A student's year of study is set once by the student and afterwards changed only by the Super Admin or the rollover.

---

## 3. Functional requirements

### 3.1 Authentication and sessions (FR-AUTH)

| ID | Requirement |
|---|---|
| FR-AUTH-1 | The system shall let a user sign in with email and password and keep them signed in with a JWT access token valid for one day. |
| FR-AUTH-2 | The system shall let a user reset a forgotten password through an emailed link. |
| FR-AUTH-3 | The system shall validate passwords with Django's password validators. |
| FR-AUTH-4 | The system shall limit sign-in attempts to 10 a minute per account and 600 a minute per network address, and other requests to 120 a minute per address (configurable). |
| FR-AUTH-5 | The sign-in form shall show validation errors beside the field (no browser pop-ups) and a wrong email or password as a message in the form. |
| FR-AUTH-6 | The system shall refuse every request from a disabled account. |

### 3.2 Roles and permissions (FR-ROLE)

| ID | Requirement |
|---|---|
| FR-ROLE-1 | The system shall support the roles Student, Super Admin, Service Admin, Event Manager, Course Coordinator, Family Admin, QA Moderator and QA Counselor; a person may hold several. |
| FR-ROLE-2 | Only a Super Admin shall assign or remove roles. |
| FR-ROLE-3 | The system shall refuse a role to a person whose year of study is too low: year 2+ for Service Admin, Event Manager, Course Coordinator and Family Admin; year 3+ for QA Counselor and QA Moderator; year 2+ for a family father or mother (never a graduate). Graduates qualify for the other roles. |
| FR-ROLE-4 | The system shall always keep at least one Super Admin; a Super Admin cannot remove their own role or deactivate themselves. |
| FR-ROLE-5 | The server shall check permissions on every endpoint; hidden buttons in the interface are never the protection. |
| FR-ROLE-6 | The website shall show each user a menu with the pages of all the roles they hold. |
| FR-ROLE-7 | A Service Admin role shall come only from being made the admin of a group the person is a member of; removing that admin shall remove the role unless the person runs another group. |

### 3.3 Registration and account setup (FR-REG)

| ID | Requirement |
|---|---|
| FR-REG-1 | The public registration page shall be closed by default and explain how to get an account. |
| FR-REG-2 | A Super Admin shall be able to register students (a) from an Excel or CSV file with a preview of errors, confirmation, processing in chunks of 100 and **undo**, or (b) as "slips without names". |
| FR-REG-3 | The system shall give each imported student a temporary login (for example `f00001@temp.finot`) and a random 11-character password, shown **only once** for printing (8 slips per A4 page) or as a CSV. |
| FR-REG-4 | A slip shall work for a grace period of 7 to 60 days chosen at import (default 21). |
| FR-REG-5 | A student of a nameless slip shall first be asked to write their first, father's and grandfather's name and gender once. |
| FR-REG-6 | The Account page shall let the student confirm a real email with a 6-digit code (valid 15 minutes, 5 tries, 5 codes an hour, only a keyed hash stored) and set a new password. |
| FR-REG-7 | After the deadline, every request except the Account page shall be refused (`account_setup_required`) until the email and password are done. |
| FR-REG-8 | The system shall show a banner with the days left and send reminders at 14, 7, 3 and 1 days and at expiry, in the student's saved language. |
| FR-REG-10 | A slip student shall choose their year of study (1 to 5) and department once, before the name step; the choice is trusted and the Super Admin can correct it. A Super Admin switch turns the choice off: then everyone who signs in with a slip is a first-year student. The system has no year 6 or 7. |
| FR-REG-9 | A Super Admin shall be able to issue a new slip to a student who lost theirs, and to undo an unused batch. |

### 3.4 Student profile and departments (FR-PROF)

| ID | Requirement |
|---|---|
| FR-PROF-1 | A student shall be able to view and edit their profile: photo, year, department, dorm, section, Telegram, phone, emergency contact, home address, previous church, confession father. |
| FR-PROF-2 | Year of study and department shall be set once by the student; afterwards only the Super Admin can change them. |
| FR-PROF-3 | A Super Admin shall manage departments (name, program length in years, active or hidden). |
| FR-PROF-4 | A phone number shall be used for SMS only when the student opted in. |

### 3.5 Service groups (FR-SVC)

| ID | Requirement |
|---|---|
| FR-SVC-1 | The system shall list service groups with summary, activities, requirements, commitment, contact, photo and video link. |
| FR-SVC-2 | While selection is open, a non-graduate student shall be able to apply to up to three groups in priority order with skills and a reason. |
| FR-SVC-3 | A group admin shall accept applicants of their own group only; the Super Admin can do any group. |
| FR-SVC-4 | A student shall be accepted into at most two groups. |
| FR-SVC-5 | A group admin shall manage the group page, members (role, status) and group materials. |
| FR-SVC-6 | A Super Admin shall create, edit and delete groups, name each group's admin, and open or close selection. |

### 3.6 Events and event attendance (FR-EVT)

| ID | Requirement |
|---|---|
| FR-EVT-1 | An Event Manager or Super Admin shall create a **general** event (title, description, start, end, place, map link, photo) visible to everyone. |
| FR-EVT-2 | A Service Admin (or Super Admin) shall create a **group** event visible only to the group's active members. |
| FR-EVT-3 | The event form shall take Ethiopian local time and all displays shall use it. |
| FR-EVT-4 | The event status (upcoming, ongoing, completed) shall be computed from the start and end time. |
| FR-EVT-5 | The system shall notify (in-app, email, push) everyone, or the group members, when an event is published. |
| FR-EVT-6 | The event's creator (or the group's Service Admin, or the Super Admin) shall take Present/Absent attendance with a remark; one record per student per event. |
| FR-EVT-7 | A student shall see only the **ongoing** (with Check in) and **upcoming** events. Past events appear only on their Attendance page, one row each with title, date and Present or Absent; nothing else about a past event is shown to students. Organizers keep the full list with attendance data. |

### 3.6b Smart attendance: scan sessions (FR-ATT)

One mechanism for general events, group events and course class days. Present/Absent rows are still written to the event and class-day attendance tables, so reports, exports and the student history are unchanged.

| ID | Requirement |
|---|---|
| FR-ATT-1 | The person allowed to take attendance for a target (FR-EVT-6, FR-CRS-6) shall **open** an attendance session for it; at most one session per target is open at a time. |
| FR-ATT-2 | Every student shall have a personal **badge**: a signed text (student id, badge version, HMAC of the server secret) shown as a QR code; no network is needed to show it. Raising the student's badge version shall cancel an old badge. |
| FR-ATT-3 | The organizer, or a **helper** named on the session, shall mark a student Present by scanning the badge; the server checks the signature, the version, that the session is open and that the student is on the roster (FR-EVT-6 roster or the enrolled students). A second scan of the same student is reported, not duplicated. |
| FR-ATT-4 | Scans made without network shall be kept on the scanner's device and sent later as a list; sending the same list twice shall be harmless. |
| FR-ATT-5 | The organizer's screen shall show a 6-digit **room code** (and a QR holding it) that changes every 30 seconds, computed from the session and the time (nothing stored); a student on the roster shall mark themselves Present by sending the current or the previous code, at most 10 attempts a minute. |
| FR-ATT-6 | **Closing** a session shall mark Absent every roster member without a record; reopening shall allow late scans. A forgotten session shall be closed by the server after the event end + 2 h, or at 21:00 Ethiopia time on the class day. |
| FR-ATT-7 | Every check-in shall be logged with method (badge, code, manual), who scanned and when. Manual marking stays available as the fallback. |
| FR-ATT-8 | Organizers and coordinators shall see **charts** of present/absent counts and the attendance rate per event or class day, a list of people who missed the last three counted sessions, and an **estimate** for the next session (average rate of the last three counted sessions applied to the roster). Students shall see their own months and streak. No personal data leaves the organizer's scope. |

### 3.7 Courses and class attendance (FR-CRS)

| ID | Requirement |
|---|---|
| FR-CRS-1 | A Super Admin shall define curriculums (course title, description, year of study, active). |
| FR-CRS-2 | A Super Admin shall open a curriculum for a semester (academic year, semester 1 or 2) with status Not started, Open or Completed; one entry per course, year and semester. |
| FR-CRS-3 | When a course is opened, the system shall enrol automatically the active students of the matching year of study. |
| FR-CRS-4 | A Super Admin shall name coordinators per semester course; a coordinator shall manage **only** the courses where they are named. |
| FR-CRS-5 | A coordinator shall plan class days (one per date), add topic and teacher, edit or delete them. |
| FR-CRS-6 | A coordinator shall mark each enrolled student Present or Absent per class day; one record per student per class day, with the marker recorded. |
| FR-CRS-7 | The system shall show an attendance report per course and export it to Excel. |
| FR-CRS-8 | A student shall see their courses, class days, own attendance and materials. |
| FR-CRS-9 | The system shall send a "class tomorrow" reminder (in-app, push) once per class day to enrolled students of an Open course. |

### 3.8 Mentorship families (FR-FAM)

| ID | Requirement |
|---|---|
| FR-FAM-1 | A Family Admin or Super Admin shall create, rename and delete families and set a father and a mother (each person in at most one family). |
| FR-FAM-2 | The system shall distribute first-year students into mixed families with a **preview**, **confirm** and **undo** (distribution batches), using rules chosen each year by the Family Admin: family size, women : men ratio (suggested or typed), section and dorm each set to mix, together or ignore (the dorm by room or by block), and the priority of the rules. Students the ratio leaves over are listed and placed at the end into families with room. |
| FR-FAM-4 | A father or mother shall be a student of year 2 or above, never newly named while graduated (a parent who graduates stays), and lead at most one family at a time. |
| FR-FAM-5 | The Super Admin or the Family Admin shall choose parent candidates (a man or a woman meeting the requirements) and mark them trained; only trained people shall be named father or mother, one by one or many at once. |
| FR-FAM-3 | The system shall show a banner for late students not yet in a family. |
| FR-FAM-4 | A father or mother shall see each child's contact and attendance; a child shall see parents and siblings. |
| FR-FAM-5 | A family member shall send messages to the family; a child shall reply to the parents only. An email copy of a message may be sent. |
| FR-FAM-6 | A student shall not be able to read the data of another family. |

### 3.9 Questions and answers (FR-QA)

| ID | Requirement |
|---|---|
| FR-QA-1 | The system shall provide **public** questions with a nickname, a category and moderation: they appear after a moderator approves them, and answers also need approval. |
| FR-QA-2 | A signed-in student shall be able to ask a **private** question in a category: Academic, Spiritual, Family, Personal, Other. |
| FR-QA-3 | A private question shall be visible only to the asker, the counselors it is assigned to or whose specialization handles its category, and the Super Admin. Moderators shall never see it. |
| FR-QA-4 | A Personal-category question shall reach a counselor only after the Super Admin assigns it. |
| FR-QA-5 | When no counselor handles a category, the system shall mark the question "needs a counselor" in the Super Admin's list and alert the Super Admin. |
| FR-QA-6 | A counselor shall have one or more specializations (Academic, Soul teacher, Family, Psychotherapist, Other). |
| FR-QA-7 | The system shall alert moderators and counselors of new items and show a sign-in card with waiting items and public questions unanswered for over one week. |
| FR-QA-8 | The answer to a private question shall arrive in the asker's inbox with a notification. |

### 3.10 Donations (FR-DON)

| ID | Requirement |
|---|---|
| FR-DON-1 | A signed-in student shall pay a donation through Chapa in a fund: Weekly, Building fund, Charity, Special events, Other. |
| FR-DON-2 | A visitor shall donate without an account, with an optional name and email. |
| FR-DON-3 | The system shall record every payment with a unique reference, amount, currency (ETB) and status Pending, Completed or Failed. |
| FR-DON-4 | The system shall accept Chapa webhooks only with a valid signature, and re-check pending payments through a scheduled job (hourly) and a manual command. |
| FR-DON-5 | The donor shall be notified of a completed or failed payment. |
| FR-DON-6 | A student shall see their donation history; a Super Admin shall see all donations with totals and export them to Excel. |
| FR-DON-7 | The amount of the weekly reminder (default 10 birr) shall be configurable. |

### 3.11 Notifications and reminders (FR-NOT)

| ID | Requirement |
|---|---|
| FR-NOT-1 | The system shall deliver notifications in-app, by email and by push (when configured) through one dispatcher; a failing channel shall never stop the others or the request. |
| FR-NOT-2 | A user shall see an unread count (server-provided) on the bell and mark notifications as read. |
| FR-NOT-3 | The system shall send the weekly donation reminder every Thursday (09:00 Ethiopia time) to every active student and graduate, with an email limit per run, skipping undeliverable addresses; a second run within 6 days shall be skipped. |
| FR-NOT-4 | The system shall send the class reminder daily at 18:00 Ethiopia time. |
| FR-NOT-5 | Scheduled jobs shall be started by secret-protected HTTPS calls (`X-Cron-Token`) from GitHub Actions; a wrong or missing token gets a plain 404. |
| FR-NOT-6 | The system shall support SMS through a provider interface with a master switch (off by default), a monthly limit, the student's opt-in and a log of every attempt. |
| FR-NOT-7 | Server messages for the slip flow (account errors, code email, reminders) shall be sent in the user's language (Accept-Language and saved profile language). |

### 3.12 Yearly rollover (FR-YEAR)

| ID | Requirement |
|---|---|
| FR-YEAR-1 | A Super Admin shall start a new academic year with one action: every student moves up one year; students beyond their department's program length become graduates. |
| FR-YEAR-2 | The system shall show a preview and count promoted, graduated and skipped students (no year on record), keep a change list, and allow **undo**. |
| FR-YEAR-3 | Graduates shall keep their account, roles, history and weekly reminder, but cannot choose service groups and are not placed in families or attendance lists. |

### 3.13 Learning materials (FR-RES)

| ID | Requirement |
|---|---|
| FR-RES-1 | A material shall be a file or a link attached to a course, a service group, or general. |
| FR-RES-2 | The system shall validate uploads by type, size (documents up to 10 MB, video up to 100 MB) and content (a renamed file is refused); links shall use http or https. |
| FR-RES-3 | Only the course's coordinator, the group's Service Admin or the Super Admin shall upload to that scope. |

### 3.14 Super Admin console and reports (FR-ADM)

| ID | Requirement |
|---|---|
| FR-ADM-1 | The console shall offer: Overview, Users and roles, Sub-admins, Service groups, Courses, Events, Families, Departments, Academic year, Private Q&A, Donations, SMS, Register students and Exports. |
| FR-ADM-2 | The Super Admin shall export to Excel: users and roles, service groups and choices, courses (curriculums, semesters, enrolments, class days, attendance), public Q&A, materials, departments and year changes, registration batches, SMS log, donations, plus one file with everything (one sheet per table). Exports shall never contain passwords. |
| FR-ADM-3 | A Super Admin shall edit a person's details (including year and department), activate or disable an account, and issue a new slip. |
| FR-ADM-4 | A public overview shall show counts only (no personal data). |

---

## 4. External interface requirements

### 4.1 User interface
- Single-page application, responsive from 320 px to desktop. A sidebar on desktop, an icon strip on tablets and a drawer on phones.
- No browser pop-ups: confirmations use in-page dialogs, notices use toasts.
- A language selector (English, Amharic, Afaan Oromoo) available on every screen, including the phone menu.
- Public pages: Home, About, Contact, Login, Forgot password, Donate, Anonymous questions. Signed-in pages are under `/dashboard`; the Super Admin area is under `/dashboard/admin`.

### 4.2 Software interfaces

| Interface | Use |
|---|---|
| REST API (`/api/...`, `/auth/...`) | All data between the website and the server; OpenAPI schema by drf-spectacular |
| PostgreSQL | Primary database (SQLite only for local use) |
| Cloudinary | Storage of uploaded images and files |
| Chapa | Initialize and verify payments; webhook |
| SMTP relay (Brevo) or Brevo web API | Outgoing email |
| Firebase Cloud Messaging | Optional push notifications |
| GitHub Actions | Scheduled calls to the cron endpoints |

### 4.3 Communication
HTTPS only in production, with HSTS; CORS and CSRF trusted origins restricted to the website address.

---

## 5. Non-functional requirements

### 5.1 Performance and capacity (NFR-PERF)
| ID | Requirement |
|---|---|
| NFR-PERF-1 | The system shall support about 1000 registered students and several hundred signed in on the welcome day (staggered in groups on the free plan). |
| NFR-PERF-2 | List endpoints shall be paginated (20 per page by default). |
| NFR-PERF-3 | Slip sign-in shall use a lightweight password hash (about 12 ms) so a crowd can enter; real passwords use the standard hash (about 300 ms). |
| NFR-PERF-4 | Email for a bulk action shall be sent over one connection and in a background thread so the request returns quickly. |

### 5.2 Availability and reliability (NFR-REL)
| ID | Requirement |
|---|---|
| NFR-REL-1 | A health endpoint (`/health/`) shall answer without signing in and without a database call, so hosts and uptime monitors can ask often. |
| NFR-REL-2 | Bulk and destructive admin actions (import, family distribution, rollover) shall be undoable. |
| NFR-REL-3 | A failing notification channel shall be logged and shall not break the business action. |
| NFR-REL-4 | Data shall be recoverable through the database provider's point-in-time restore. |

### 5.3 Security and privacy (NFR-SEC)
| ID | Requirement |
|---|---|
| NFR-SEC-1 | No secret shall be stored in the repository; all secrets are environment variables, and the export tool shall stop if it finds a credential. |
| NFR-SEC-2 | All endpoints shall be permission-checked on the server and covered by an anonymous-access test (`core/test_anonymous_access.py`). |
| NFR-SEC-3 | API documentation shall be closed in production unless explicitly made public. |
| NFR-SEC-4 | Cron endpoints shall require the `X-Cron-Token` header; the payment webhook shall require a valid signature. |
| NFR-SEC-5 | Private questions, donations and exports containing personal data shall be restricted as in the [roles document](roles-and-permissions.md). |
| NFR-SEC-6 | The email-confirmation code shall be stored only as a keyed hash, expire in 15 minutes and limit tries. |
| NFR-SEC-7 | Upload validation shall check type, size and content. |

### 5.4 Usability and accessibility (NFR-UX)
| ID | Requirement |
|---|---|
| NFR-UX-1 | Every main task shall be possible on a phone without horizontal scrolling (checked by an automated browser audit at six widths across all pages). |
| NFR-UX-2 | Forms shall show errors beside the field and move focus to the first wrong field. |
| NFR-UX-3 | Texts shall be short and plain; the interface shall guide first-time users through the account setup. |

### 5.5 Internationalization (NFR-I18N)
| ID | Requirement |
|---|---|
| NFR-I18N-1 | Every text in the pages shall exist in English, Amharic and Afaan Oromoo (checked: 0 missing keys of about 1500). |
| NFR-I18N-2 | The website shall send its language with every request so server messages can be translated. |
| NFR-I18N-3 | Dates and times shall be shown in Ethiopian local time. |

### 5.6 Maintainability and testability (NFR-MNT)
| ID | Requirement |
|---|---|
| NFR-MNT-1 | Business rules shall live in small tested modules (`role_rules`, `group_rules`, `access`, `visibility`). |
| NFR-MNT-2 | The backend shall have an automated test suite (458 tests at version 1.0) and the front end shall pass a TypeScript build; both run in continuous integration on every push. |
| NFR-MNT-3 | The documentation shall describe setup, configuration, deployment, roles, security and the API. |

### 5.7 Portability and cost (NFR-OPS)
| ID | Requirement |
|---|---|
| NFR-OPS-1 | The backend shall run from one Docker image and be configured only through environment variables. |
| NFR-OPS-2 | The system shall run on free tiers of the chosen providers (Neon, Render, Cloudflare Pages, GitHub Actions). |

---

## 6. Data requirements
The logical and physical data model, constraints and retention rules are in the [Database design](database-design.md).

## 7. Acceptance and verification

| Area | How it is verified |
|---|---|
| Business rules and permissions | Automated backend tests (pytest) for each module, including anonymous and cross-user access tests |
| Front end | TypeScript type check and production build in CI |
| Responsive layout | Browser audit (Playwright) over all pages at six widths |
| Languages | Script that compares the translation files with the keys used in the pages |
| Payments | Chapa test mode with the success and webhook flow |
| Scheduled jobs | Manual workflow runs; the weekly job run twice must answer `skipped` the second time |
| Live system | Health check, sign-in with a slip, 6-digit code email on the live site |

## 8. Traceability (PRD feature → requirements → main code)

| PRD feature | Requirements | Backend module | Front-end area |
|---|---|---|---|
| F1 Auth and roles | FR-AUTH, FR-ROLE | `core/` | `features/auth/`, `routes/` |
| F2 Registration slips | FR-REG | `student/account_import.py`, `student/account_setup.py` | `AdminImportPage`, `AccountPage` |
| F3 Profile | FR-PROF | `student/` | `DashboardProfile`, `EditProfile` |
| F4 Service groups | FR-SVC | `service/` | `features/service-groups/` |
| F5 Events | FR-EVT | `service/` | `DashboardEvents`, `EventManagement` |
| F6 Courses | FR-CRS | `course/` | `pages/course/` |
| F7 Families | FR-FAM | `service/family_hub.py` | `DashboardFamily`, `AdminFamiliesPage` |
| F8 Q&A | FR-QA | `questionanswer/` | `pages/` Q&A, `ModeratorQueue`, `CounselorQueue` |
| F9 Donations | FR-DON | `donation/` | donation pages |
| F10 Notifications | FR-NOT | `notifications/` | notification bell and page |
| F11 Rollover | FR-YEAR | `student/rollover.py` | `AdminYearPage` |
| F12 Materials | FR-RES | `resources/` | `ResourcesList`, `CourseMaterialsPage` |
| F13 Console and exports | FR-ADM | `analytics/` | `features/admin-console/` |

## Mobile app for role holders (FR-MOB)
- FR-MOB-1: one app and one sign-in; role holders (Super Admin, Event Manager, Service Admin, Course Coordinator, QA Moderator, QA Counselor) see a Manage tab, students do not. The phone only hides screens; every action is checked by the server.
- FR-MOB-2: attendance on the phone uses the same API as the website. Nobody, including the Super Admin, takes attendance for an event that has not started (live attendance opens 1 hour before the start) or a class day before its date; hand marking never overwrites a newer mark.
- FR-MOB-3: tablets get a navigation rail and landscape is supported.
