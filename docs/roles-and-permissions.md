# Roles and permissions

Everyone who registers is a **Student**. A student has no role row; the other roles are added by the Super Admin. A person may hold several roles, and their menu shows the pages of every role they hold. The server enforces every rule below; the website only hides what you cannot do.

## The roles

| Role | Given how | What they can do |
|---|---|---|
| **Student** | registering | profile, events and own attendance, own courses, family, service-group selection, donations, public and private questions, resources |
| **Super Admin** | by another Super Admin, or `create_first_admin` | everything: the admin console (users and roles, service groups, courses, families, departments, academic year, private Q&A, donations, SMS, exports) |
| **Service Admin** | by being made the admin of a group they are a **member** of (not tickable) | their own group: applicants, members, student-facing page, group materials, group events (seen and emailed only to that group) and attendance of their group's members for those events |
| **Event Manager** | Users & roles | announce **general** events to everyone, edit or delete their own, and take attendance for the general events they made (picking from all active in-campus students) |
| **Course Coordinator** | Users & roles, **plus** being named on a semester course | manage **only the courses where they are named**: class days, attendance, report and Excel, materials, start/complete the course |
| **Family Admin** | Users & roles | help with families |
| **QA Moderator** | Users & roles | approve public questions and answers; answer long-unanswered public questions; sees alerts |
| **QA Counselor** | Users & roles (the same window sets what they handle) | answer private questions of the categories they handle, or that were assigned to them |

A Course Coordinator can only act on a course where the Super Admin named them. The role alone opens nothing.

Events work the same way: a **general** event (no service group) is made by an Event Manager or the Super Admin and goes to everyone; a **group** event is made by that group's Service Admin (or the Super Admin) and goes only to that group's active members. Attendance for a general event is taken by the Event Manager who made it, for a group event by that group's Service Admin; the Super Admin can take attendance for any event.

## Year-of-study rules

A role can only go to a person whose year allows it. A graduate always qualifies.

| Role | Needs |
|---|---|
| Service Admin, Event Manager, Course Coordinator, Family Admin | year 2 or above (or graduate) |
| QA Counselor, QA Moderator | year 3 or above (or graduate) |
| Family father or mother | year 2 or above (or graduate) |
| Super Admin | no rule |

A person with no year on record cannot receive a role until the Super Admin sets it (Users & roles → Edit details).

## Safeguards

- At least one Super Admin must always exist. You cannot remove your own Super Admin role or deactivate yourself.
- Changing or clearing a group's admin takes the Service Admin role away unless the person runs another group. The admin cannot be removed from their own group.
- A student can be accepted into at most **two** service groups. Group admins accept applicants of their own group only; the Super Admin can do any group.
- Year of study and department are set by the student once. After that only the Super Admin can change them (Edit details), or the yearly rollover moves the year.
- Graduates keep their account, roles, history and the weekly donation reminder. They cannot choose service groups and are not placed in families or attendance lists.

## Private questions: who sees what

Categories and the counselor specialization that handles each:

| Category | Handled by specialization |
|---|---|
| Academic | Academic |
| Spiritual | Spiritual (soul teacher) |
| Family | Family |
| Personal | Personal (psychotherapist); **sensitive**: reaches a counselor only after the Super Admin assigns it |
| Other | Other |

- A counselor sees a private question only if it is assigned to them, or it is unassigned and in a category they handle.
- A question assigned to specific counselors is visible only to them (and the Super Admin).
- If nobody handles a category, the question appears in the Super Admin's Private Q&A as "needs a counselor", and the Super Admin gets an alert.
- Moderators never see private questions. Only signed-in students can ask private questions, because the answer arrives in their private inbox.
- The Super Admin sees every private question.
