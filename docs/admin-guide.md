# Admin guide (for the project owner)

Written for: the person who runs Finot day to day as **Super Admin**. Everything below is done from the website, in the admin menu at `/dashboard/admin`.

## 1. First start

1. A developer runs `create_first_admin` once (see [local-setup.md](local-setup.md)). That creates the first Super Admin with the owner's own password.
2. Sign in at `/login` (the login field holds the email). You land on **Admin overview**.

There is no "add user" button on purpose: **every person registers themselves** at `/register`, then sets their year of study, department and phone once in **Profile → Edit Profile**. You then give roles.

## 2. Set up, in this order

1. **Departments** – add each department with its length in years (4, 5, ...). Students pick from this list, and the length tells the system when a student graduates. Where freshers enter a division first (Pre-Science, Pre-Engineering, then a school), add those as departments ticked **"a stage before the final department"** and say what each one **leads to**: a student on a stage may choose again from that list; the final department is chosen once.
2. **Users & roles** – find a person and use **Edit roles**. Rules by year of study are in [roles-and-permissions.md](roles-and-permissions.md). When you tick **QA Counselor**, the same window lets you tick the question categories that counselor answers.
3. **Service groups** – create a group; add members (**Members → Add a student**); then **Edit group → Group admin** and pick one of its members. That person becomes the group's Service Admin automatically. Turn the **selection window** on when students may choose groups; group admins accept applicants.
4. **Courses** – see section 3.
5. **Families** – create a family (name, gender, father, mother). Use **Distribution** to spread first-year students by gender, dorm block and section: preview, confirm, undo if needed.
6. **Private Q&A** – tick what each counselor handles; assign sensitive questions yourself.

## 3. Courses

1. **Curriculums → New curriculum**: title, batch (year of study), description. A batch can have several curriculums.
2. On a curriculum card, **Open for a semester**: academic year, semester, and the **coordinators** (people who already hold the Course Coordinator role). Students of that batch are enrolled automatically, and a student who later reaches that batch joins by themselves.
3. The coordinator manages the course from **Course Coordinator** in their menu:
   - a new course is **Not started**: students cannot see it yet. The coordinator **plans class days**, then presses **Start course**.
   - **Open**: students see it in **My courses**. The coordinator takes attendance (Present or Absent), reads the report (summary and day-by-day grid), exports it to Excel, and adds materials.
   - **Complete course**: students keep the materials and their own attendance; class days and attendance are frozen. The coordinator can **Reopen** it.
4. Students see only the courses of their own year. A course a coordinator merely coordinates never appears in their "My courses".

If enrolments ever look wrong, a developer can run `sync_course_enrolments` (it shows what it would change; add `--yes` to apply).

## 3b. Events

- **General events** (an announcement to everyone, like a channel): the **Event Manager** (or you, under **Events** in the admin menu) creates the event with title, start and end time, place (and a map link) and a description of what people need to know (what to bring, who speaks). Every active student gets a notification and an email.
- **Group events**: the group's Service Admin creates them in **Manage Ageglot → Events**. Only that group's active members see them and are told by notification and email.
- **Attendance**: open the **Attendance** tab, choose the event, tick the people who came (everyone unticked is saved as absent) and save. The Event Manager does this for their own general events, the Service Admin for their group's events, you for any event. Students see only ongoing and upcoming events; their past events are rows (title, date, present or absent) under **Attendance**.
- Times are entered and shown in Ethiopian local time.
- **Scan attendance** (events, group events and class days alike): the organizer opens a session, scans each student's Finot badge (the QR on their phone or printed), or shows the 6-digit room code on a screen so students with data mark themselves. Helpers named on the session may scan too, from their own phones, and scans made without network are sent later. Closing the session marks everyone else absent; a forgotten session closes itself. Manual ticking still works.

## 4. Questions and answers

- **Public questions**: anyone can ask (with an optional nickname). A **Moderator** approves the question; any signed-in person can answer; the Moderator approves answers. Moderators are alerted, and see a list of public questions with no answer for more than a week, which they can answer themselves (published at once).
- **Private questions**: signed-in students only. The question goes to the counselors who handle its category. A sensitive Personal question, or one in a category nobody handles, needs **you** to assign a counselor, and you are alerted. Counselors answer directly; no approval is needed; the asker reads the answer in their private inbox.

## 5. Donations

- Signed-in students give their **weekly donation** (an amount only). Visitors without an account simply **support** the fellowship (amount, optional name, optional email).
- **Admin → Donations** lists every donation with totals (only Chapa-confirmed payments count), filters and an Excel export. **Check pending payments** asks Chapa about payments that were started but never confirmed.
- See [payments-chapa.md](payments-chapa.md).

## 6. Once a year: start the new year

**Academic year → Start new year**: read the preview (who moves up, who graduates), type a name for the new year (for example 2027/28), confirm. Everyone moves up one year; students finishing their program become **Graduated** and keep their account. Do it **before** the new first-year students register. A second run within six months is refused unless you tick "I understand"; the latest run can be undone.

## 7. Reports

**Export to Excel**: students, families, events, event attendance, private Q&A log (contains personal information), donations. Course attendance reports are exported from each course's report page.

## 8. Things that run by themselves

| What | When |
|---|---|
| Donation reminder (in-app, email, push) | every Thursday, 09:00 Ethiopia time |
| "Class tomorrow" reminder | every day, 18:00 Ethiopia time |
| Re-check of pending payments | every hour |
| Email outbox: send waiting event emails (daily limit), "event tomorrow" reminders, close forgotten attendance sessions | every 6 hours |

Details and how to switch them on are in [notifications-and-reminders.md](notifications-and-reminders.md).

## 9. Training others

Teach in this order, one short session each: the admin console (Overview, Users & roles, Sub-admins) → service groups → courses → families → private Q&A → exports and reminders → one session per sub-admin role (see [roles-and-permissions.md](roles-and-permissions.md)).
