# Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Finot, the Gibi Gubae fellowship platform |
| **Document type** | Product Requirements Document |
| **Status** | Version 1.0 is live: https://finot.pages.dev |
| **Related documents** | [SRS](software-requirements-specification.md) (detailed, testable requirements) · [Database design](database-design.md) · [Architecture](architecture.md) · [UX brief](ux-design-brief.md) |

---

## 1. Summary

Gibi Gubae is a student fellowship (an Orthodox Christian student ministry) at Ethiopian universities. Every year about a thousand new students join, and the leaders run the fellowship with paper lists, chat groups and spreadsheets.

**Finot** replaces those with one web platform. It handles the whole spiritual and community life of a student, from the day they join until they graduate: who they are, which service group they serve in, which course they attend, which mentorship family they belong to, which events they were present at, what they donated, and where they can ask a question safely.

## 2. Problem

| Problem today | Effect |
|---|---|
| Student lists live in many spreadsheets and chat groups | Duplicates, outdated data, nobody sees the whole picture |
| Attendance is taken on paper | Results are lost or typed in again; no report per student |
| Registering about 1000 first-years by hand | Weeks of work for a few volunteers |
| Mentorship families are formed by hand | Uneven, slow, hard to correct |
| Sensitive questions go through personal chats | No privacy, no routing to the right counselor, no follow-up |
| Weekly donations are collected in cash | No record, no reminder, no report |
| Leaders change every year | Knowledge leaves with them |
| Most students use a phone and many speak Amharic or Afaan Oromoo | An English-only desktop tool would not be used |

## 3. Goals and non-goals

### Goals

1. One source of truth for every student and every role in the fellowship.
2. Register a thousand new students in an afternoon, not in weeks (printed login slips, then the student confirms a real email).
3. Give each leader exactly the tools and the data their role needs, nothing more.
4. Take attendance (classes and events) on a phone and report it per student and per course.
5. Let students ask spiritual or personal questions with privacy, and route them to the right counselor.
6. Collect donations online and keep an honest record.
7. Work well on a phone, in English, Amharic and Afaan Oromoo.
8. Be cheap to run (free tiers) and simple to hand over to the next year's leaders.

### Non-goals (version 1)

- Not a general learning management system (no grading, no video lessons).
- Not a chat application (family messages are simple, no real-time chat).
- A mobile app (Expo, Android first) exists next to the website: students use Home, Events, Courses, Giving, Alerts and Profile; role holders get a **Manage** tab (event and class attendance, Super Admin overview and email status, questions). The server decides what each role may do. Not yet: offline scan queue, iPhone build.
- No SMS sending by default (built, but switched off until a provider is chosen).
- No online registration for the public: students are registered by the organization.

## 4. Users and personas

| Persona | Who they are | What they need |
|---|---|---|
| **Student** (a first-year to a final-year student, or a graduate) | Uses a phone, limited data, may not read English well | Sign in easily, see events and courses, give a donation, ask a question, find their family |
| **Super Admin** (project owner) | Runs the fellowship's whole system | See everything, give roles, register students, run the yearly rollover, export data |
| **Service Admin** | Leads one service group (for example choir, media) | Accept applicants, manage members, announce group events, take attendance |
| **Event Manager** | Organizes fellowship-wide events | Announce an event to everyone, take attendance |
| **Course Coordinator** | Runs one course in one semester | Plan class days, take attendance, upload materials, report |
| **Family Admin** | Helps form mentorship families | Distribute first-years into families, correct the result |
| **Family father / mother** | Senior students who mentor a family | See their children's contact and attendance, write to the family |
| **QA Moderator** | Keeps public Q&A healthy | Approve questions and answers |
| **QA Counselor** | A teacher, soul teacher or psychotherapist | Answer private questions in their field |
| **Visitor** | Anyone on the internet | Read about the fellowship, donate without an account, ask a public question |

## 5. Product scope: features

Priority: **P0** = needed for the launch, **P1** = important, **P2** = later. Every feature is delivered in version 1 unless marked otherwise. Detailed requirements are in the [SRS](software-requirements-specification.md) (the IDs are in brackets).

| # | Feature | Priority | SRS |
|---|---|---|---|
| F1 | Sign-in, password reset, roles and year-of-study rules | P0 | FR-AUTH, FR-ROLE |
| F2 | Bulk registration with login slips, first-sign-in setup, email confirmation by a 6-digit code | P0 | FR-REG |
| F3 | Student profile and departments | P0 | FR-PROF |
| F4 | Service groups: browse, apply (up to 3 choices), accept (max 2 groups), group page | P0 | FR-SVC |
| F5 | Events: general and group events, notification, attendance | P0 | FR-EVT |
| F6 | Courses: curriculums, semester courses, automatic enrolment, class days, attendance, reports | P0 | FR-CRS |
| F7 | Mentorship families: smart distribution with preview and undo, family messages | P1 | FR-FAM |
| F8 | Public and private questions with moderation and counselor routing | P0 | FR-QA |
| F9 | Donations with Chapa (students and visitors) | P0 | FR-DON |
| F10 | Notifications: in-app, email, push; weekly and class reminders | P0 | FR-NOT |
| F11 | Yearly rollover: promote, graduate, undo | P1 | FR-YEAR |
| F12 | Learning materials (files and links) | P1 | FR-RES |
| F13 | Super Admin console and Excel exports | P0 | FR-ADM |
| F14 | English, Amharic, Afaan Oromoo | P0 | NFR-I18N |
| F15 | SMS notifications (built, off by default) | P2 | FR-NOT-6 |

## 6. Key user journeys

1. **A new student joins.** The organization prints a slip (a login and a password). The student signs in, writes their name, then confirms a real email with a 6-digit code and chooses their own password. They have 21 days (the deadline is set at registration); reminders arrive at 14, 7, 3 and 1 days.
2. **A student serves.** The student opens the service-group list, chooses up to three groups with the reason and skills. A Service Admin accepts them. They then see that group's events.
3. **A coordinator teaches.** The Super Admin opens a course for the semester and names the coordinator. Students of the matching year are enrolled automatically. The coordinator plans class days and takes attendance on a phone. The student gets a "class tomorrow" reminder.
4. **A student asks a private question.** The student picks a category. The system finds the counselors who handle that category and alerts them. A sensitive (personal) question waits for the Super Admin to assign a counselor. The answer arrives in the student's inbox.
5. **A student gives.** The student presses "Give", pays through Chapa, and sees the donation in their history. A visitor does the same without an account.
6. **A new year starts.** The Super Admin presses "Start new year": students move up one year, the last-year students become graduates, courses of the matching year open, and the result can be undone.

## 7. Success metrics

| Metric | Target |
|---|---|
| Students who finished the account setup (real email + own password) within the deadline | ≥ 90 % |
| Time to register 1000 students | under 1 hour of admin work |
| Share of attendance taken digitally | ≥ 90 % of classes |
| Private questions answered within one week | ≥ 90 % |
| Share of visits from a phone that complete a main task | ≥ 80 % |
| Monthly cost of running the platform | 0 USD on free tiers (about 7 USD for a busy month) |
| Sign-in page load on a mid-range phone | under 3 s on 4G |

## 8. Constraints and assumptions

- **Budget:** free hosting tiers. The free backend is slow to wake up (about 30 to 60 seconds) and has a weak CPU, so the welcome day should be staggered or use a one-month paid plan.
- **Email:** the free host blocks the usual mail ports, so email goes through an SMTP relay on port 2525 (or the provider's web API).
- **Payments:** Chapa is the Ethiopian gateway; it needs https callbacks and charges a fee.
- **Users:** many share one campus network address; rate limits are set per address and are generous.
- **Language:** the Amharic and Afaan Oromoo texts need review by native speakers.
- **Privacy:** private questions and personal data must never be visible to anyone outside the rules in the [roles document](roles-and-permissions.md).

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free backend is slow on the welcome day | Students give up on signing in | Sign-in in groups of 50 to 100, or a one-month paid plan; a light sign-in hash for slips |
| Email lands in spam (sender is not on an owned domain) | Students do not get their 6-digit code | Authenticate a sender on a domain the organization owns |
| A leaked secret | Data exposure | Secrets only in environment variables, rotation procedure in [security.md](security.md) |
| Wrong data deleted by an admin | Lost records | Undo for imports, rollover and family distribution; database point-in-time restore |
| Leaders change every year | Platform becomes unmaintained | [Admin guide](admin-guide.md), role system, documentation |
| Translation mistakes | Confusion or offence | Native-speaker review |

## 10. Delivery phases

| Phase | Content | Status |
|---|---|---|
| 1 | Accounts, roles, service groups, events | Done |
| 2 | Courses, attendance, materials, reports | Done |
| 3 | Families, questions and answers, donations | Done |
| 4 | Notifications, reminders, yearly rollover, Excel exports | Done |
| 5 | Languages (English, Amharic, Afaan Oromoo), responsive pass, security pass | Done |
| 6 | Bulk registration with login slips, production deployment | **Live** |
| Next | Email sender on an owned domain, live Chapa key, native-speaker review of translations | Planned |
| Ideas | SMS provider, a prayer and fasting calendar, a mobile app wrapper | Not decided |

## 11. Open questions

1. Which domain will the organization own for the email sender and the website address?
2. Who pays Chapa's fee, the donor or the fellowship?
3. Which SMS provider (if any) after the trial?
4. Who reviews the Amharic and Afaan Oromoo wording?
5. Should graduates keep the weekly donation reminder? (Currently yes.)
