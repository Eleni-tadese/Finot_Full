# API endpoints

Generated from the code (`manage.py spectacular`). For request and response shapes use the live Swagger UI at `/api/docs/swagger/`. Conventions, authentication and examples are in [api.md](api.md).

## `/api/account/`

| Method | Path | Summary |
|---|---|---|
| POST | `/api/account/change-password/` | api_account_change_password_create |
| POST | `/api/account/confirm-email/` | api_account_confirm_email_create |
| POST | `/api/account/email-code/` | api_account_email_code_create |
| GET | `/api/account/status/` | api_account_status_retrieve |

## `/api/admin-console/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/admin-console/academic-year/` | What "Start new year" would do right now, plus the history of earlier runs. |
| POST | `/api/admin-console/academic-year/rollover/` | api_admin_console_academic_year_rollover_create |
| POST | `/api/admin-console/academic-year/rollover/{id}/undo/` | api_admin_console_academic_year_rollover_undo_create |
| GET | `/api/admin-console/accounts/import/batches/` | api_admin_console_accounts_import_batches_retrieve |
| POST | `/api/admin-console/accounts/import/batches/{id}/undo/` | api_admin_console_accounts_import_batches_undo_create |
| POST | `/api/admin-console/accounts/import/commit/` | api_admin_console_accounts_import_commit_create |
| POST | `/api/admin-console/accounts/import/preview/` | api_admin_console_accounts_import_preview_create |
| GET | `/api/admin-console/accounts/import/template/` | api_admin_console_accounts_import_template_retrieve |
| GET | `/api/admin-console/departments/` | api_admin_console_departments_retrieve |
| POST | `/api/admin-console/departments/` | api_admin_console_departments_create |
| PATCH | `/api/admin-console/departments/{id}/` | api_admin_console_departments_partial_update |
| DELETE | `/api/admin-console/departments/{id}/` | api_admin_console_departments_destroy |
| GET | `/api/admin-console/donations/` | GET donations/?status=&fund=&kind=&search=&date_from=&date_to=&page=  rows + totals for the whole filter. |
| POST | `/api/admin-console/donations/recheck/` | POST donations/recheck/ : ask Chapa now about every pending payment (no waiting time). |
| GET | `/api/admin-console/families/` | All families with their father, mother and size (families without a parent come first). |
| POST | `/api/admin-console/families/` | Create a family. Body: name, gender ("M" / "F" / empty = mixed), optional father_id (a man), |
| GET | `/api/admin-console/families/distribution/` | api_admin_console_families_distribution_retrieve |
| POST | `/api/admin-console/families/distribution/auto-preview/` | POST families/distribution/auto-preview/ : the system plans the families too (nothing is saved). |
| POST | `/api/admin-console/families/distribution/batches/{id}/undo/` | api_admin_console_families_distribution_batches_undo_create |
| POST | `/api/admin-console/families/distribution/confirm/` | api_admin_console_families_distribution_confirm_create |
| POST | `/api/admin-console/families/distribution/preview/` | api_admin_console_families_distribution_preview_create |
| GET | `/api/admin-console/families/people/` | GET families/people/?search= : name and email of active people, so a father or mother can be picked. |
| PATCH | `/api/admin-console/families/{id}/` | PATCH families/<id>/ : set or change the father, mother, religious father or name. Send father_id: null to clear. |
| DELETE | `/api/admin-console/families/{id}/` | Delete a family. Its students are left without a family (they can be placed again); the parents are freed. |
| GET | `/api/admin-console/overview/` | api_admin_console_overview_retrieve |
| GET | `/api/admin-console/qa/counselors/` | api_admin_console_qa_counselors_retrieve |
| PUT | `/api/admin-console/qa/counselors/{id}/specializations/` | api_admin_console_qa_counselors_specializations_update |
| GET | `/api/admin-console/roles/` | api_admin_console_roles_retrieve |
| GET | `/api/admin-console/service-config/` | Open or close the period in which students may choose their service groups. |
| PATCH | `/api/admin-console/service-config/` | Open or close the period in which students may choose their service groups. |
| GET | `/api/admin-console/service-groups/` | api_admin_console_service_groups_retrieve |
| POST | `/api/admin-console/service-groups/` | Create a group. Body (JSON or multipart): name, content fields, optional admin_id. |
| PATCH | `/api/admin-console/service-groups/{id}/` | api_admin_console_service_groups_partial_update |
| DELETE | `/api/admin-console/service-groups/{id}/` | api_admin_console_service_groups_destroy |
| PUT | `/api/admin-console/service-groups/{id}/admin/` | api_admin_console_service_groups_admin_update |
| GET | `/api/admin-console/sms/logs/` | api_admin_console_sms_logs_retrieve |
| GET | `/api/admin-console/sms/settings/` | api_admin_console_sms_settings_retrieve |
| PATCH | `/api/admin-console/sms/settings/` | api_admin_console_sms_settings_partial_update |
| GET | `/api/admin-console/sub-admins/` | api_admin_console_sub_admins_retrieve |
| GET | `/api/admin-console/users/` | api_admin_console_users_retrieve |
| GET | `/api/admin-console/users/filters/` | Values that actually exist, so the filter dropdowns only offer choices that match someone. |
| GET | `/api/admin-console/users/{id}/` | Everything about one person (Super Admin only). |
| PATCH | `/api/admin-console/users/{id}/` | api_admin_console_users_partial_update |
| POST | `/api/admin-console/users/{id}/reissue/` | POST users/<id>/reissue/ : a lost slip. New random password, the deadline starts again. Returns the credentials once. |

## `/api/analytics/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/analytics/export/course-attendance/{semester_course_id}/` | api_analytics_export_course_attendance_retrieve |
| GET | `/api/analytics/export/donations/` | api_analytics_export_donations_retrieve |
| GET | `/api/analytics/export/event-attendance/` | api_analytics_export_event_attendance_retrieve |
| GET | `/api/analytics/export/events/` | api_analytics_export_events_retrieve |
| GET | `/api/analytics/export/families/` | api_analytics_export_families_retrieve |
| GET | `/api/analytics/export/private-qa/` | api_analytics_export_private_qa_retrieve |
| GET | `/api/analytics/export/students/` | api_analytics_export_students_retrieve |

## `/api/auth/`

| Method | Path | Summary |
|---|---|---|
| POST | `/api/auth/google/` | class used for social authentications |

## `/api/course/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/course/attendance/` | api_course_attendance_list |
| POST | `/api/course/attendance/` | api_course_attendance_create |
| POST | `/api/course/attendance/bulk-mark/{session_id}/` | api_course_attendance_bulk_mark_create |
| GET | `/api/course/attendance/{id}/` | api_course_attendance_retrieve |
| PUT | `/api/course/attendance/{id}/` | api_course_attendance_update |
| PATCH | `/api/course/attendance/{id}/` | api_course_attendance_partial_update |
| DELETE | `/api/course/attendance/{id}/` | api_course_attendance_destroy |
| GET | `/api/course/curriculums/` | CRUD for curriculums. |
| POST | `/api/course/curriculums/` | CRUD for curriculums. |
| GET | `/api/course/curriculums/{id}/` | CRUD for curriculums. |
| PUT | `/api/course/curriculums/{id}/` | CRUD for curriculums. |
| PATCH | `/api/course/curriculums/{id}/` | CRUD for curriculums. |
| DELETE | `/api/course/curriculums/{id}/` | CRUD for curriculums. |
| GET | `/api/course/enrollments/` | api_course_enrollments_list |
| POST | `/api/course/enrollments/` | api_course_enrollments_create |
| POST | `/api/course/enrollments/bulk-enroll/{semester_course_id}/` | api_course_enrollments_bulk_enroll_create |
| GET | `/api/course/enrollments/{id}/` | api_course_enrollments_retrieve |
| PUT | `/api/course/enrollments/{id}/` | api_course_enrollments_update |
| PATCH | `/api/course/enrollments/{id}/` | api_course_enrollments_partial_update |
| DELETE | `/api/course/enrollments/{id}/` | api_course_enrollments_destroy |
| GET | `/api/course/semester-courses/` | CRUD for semester courses. |
| POST | `/api/course/semester-courses/` | CRUD for semester courses. |
| GET | `/api/course/semester-courses/my-attendance-summary/` | The requesting student's attendance percentage in each enrolled course. |
| GET | `/api/course/semester-courses/{id}/` | CRUD for semester courses. |
| PUT | `/api/course/semester-courses/{id}/` | CRUD for semester courses. |
| PATCH | `/api/course/semester-courses/{id}/` | CRUD for semester courses. |
| DELETE | `/api/course/semester-courses/{id}/` | CRUD for semester courses. |
| GET | `/api/course/semester-courses/{id}/attendance-report/` | Per-student attendance percentage for one course (coordinators / super admin). |
| POST | `/api/course/semester-courses/{id}/set-status/` | The coordinator (or Super Admin) starts, completes or reopens the course. |
| GET | `/api/course/sessions/` | api_course_sessions_list |
| POST | `/api/course/sessions/` | api_course_sessions_create |
| POST | `/api/course/sessions/bulk/` | Create several class days at once (the coordinator picked them from a plan). |
| GET | `/api/course/sessions/{id}/` | api_course_sessions_retrieve |
| PUT | `/api/course/sessions/{id}/` | api_course_sessions_update |
| PATCH | `/api/course/sessions/{id}/` | api_course_sessions_partial_update |
| DELETE | `/api/course/sessions/{id}/` | api_course_sessions_destroy |
| GET | `/api/course/sessions/{id}/roster/` | api_course_sessions_roster_retrieve |

## `/api/donations/`

| Method | Path | Summary |
|---|---|---|
| POST | `/api/donations/cron/verify-pending/` | Hourly trigger for the safety net (see .github/workflows/verify-donations.yml). |
| POST | `/api/donations/initiate/` | Public View to start a donation. |
| GET | `/api/donations/my-history/` | Allows students to see their own donation history. |
| GET | `/api/donations/verify/{tx_ref}/` | Verify transaction status with Chapa. |
| POST | `/api/donations/webhook/` | Asynchronous Webhook listener for Chapa payment events. |

## `/api/notifications/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/notifications/` | List user notifications. Allows marking as read. |
| POST | `/api/notifications/cron/account-setup-reminders/` | Daily trigger for the "finish your account" reminders (see .github/workflows/account-setup-reminders.yml). |
| POST | `/api/notifications/cron/class-reminders/` | Daily trigger for the "class tomorrow" notifications (see .github/workflows/class-reminders.yml). Same secret as the weekly one. |
| POST | `/api/notifications/cron/weekly-reminders/` | Called by a free external scheduler (see .github/workflows/weekly-reminders.yml). |
| GET | `/api/notifications/device-token/` | Registers the Firebase Cloud Messaging device token. |
| POST | `/api/notifications/device-token/` | Registers the Firebase Cloud Messaging device token. |
| GET | `/api/notifications/device-token/{id}/` | Registers the Firebase Cloud Messaging device token. |
| PUT | `/api/notifications/device-token/{id}/` | Registers the Firebase Cloud Messaging device token. |
| PATCH | `/api/notifications/device-token/{id}/` | Registers the Firebase Cloud Messaging device token. |
| DELETE | `/api/notifications/device-token/{id}/` | Registers the Firebase Cloud Messaging device token. |
| POST | `/api/notifications/mark-all-read/` | List user notifications. Allows marking as read. |
| GET | `/api/notifications/unread-count/` | List user notifications. Allows marking as read. |
| GET | `/api/notifications/{id}/` | List user notifications. Allows marking as read. |
| POST | `/api/notifications/{id}/mark-read/` | List user notifications. Allows marking as read. |

## `/api/public/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/public/overview/` | api_public_overview_retrieve |

## `/api/qa/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/qa/answers/` | Public Endpoint for Answers. |
| POST | `/api/qa/answers/` | Public Endpoint for Answers. |
| GET | `/api/qa/answers/pending/` | Endpoint: GET /api/qa/answers/pending/ |
| GET | `/api/qa/answers/{id}/` | Public Endpoint for Answers. |
| PUT | `/api/qa/answers/{id}/` | Public Endpoint for Answers. |
| PATCH | `/api/qa/answers/{id}/` | Public Endpoint for Answers. |
| DELETE | `/api/qa/answers/{id}/` | Public Endpoint for Answers. |
| POST | `/api/qa/answers/{id}/approve/` | Endpoint: POST /api/qa/answers/{id}/approve/ |
| GET | `/api/qa/questions/` | Public Endpoint for Anonymous Questions. |
| POST | `/api/qa/questions/` | Public Endpoint for Anonymous Questions. |
| GET | `/api/qa/questions/counselor-queue/` | Endpoint: /api/qa/questions/counselor-queue/ |
| GET | `/api/qa/questions/moderation-queue/` | Endpoint: /api/qa/questions/moderation-queue/ |
| GET | `/api/qa/questions/my-contributions/` | Endpoint: /api/qa/questions/my-contributions/ |
| GET | `/api/qa/questions/my-work/` | Endpoint: GET /api/qa/questions/my-work/ |
| GET | `/api/qa/questions/private-inbox/` | Endpoint: /api/qa/questions/private-inbox/ |
| GET | `/api/qa/questions/unanswered/` | Endpoint: GET /api/qa/questions/unanswered/   (optional ?days=7) |
| GET | `/api/qa/questions/{id}/` | Public Endpoint for Anonymous Questions. |
| PUT | `/api/qa/questions/{id}/` | Public Endpoint for Anonymous Questions. |
| PATCH | `/api/qa/questions/{id}/` | Public Endpoint for Anonymous Questions. |
| DELETE | `/api/qa/questions/{id}/` | Public Endpoint for Anonymous Questions. |
| POST | `/api/qa/questions/{id}/approve/` | Endpoint: POST /api/qa/questions/{id}/approve/ |
| POST | `/api/qa/questions/{id}/assign/` | Endpoint: POST /api/qa/questions/{id}/assign/   body: {"counselor_ids": [1, 2]} |

## `/api/resources/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/resources/materials/` | List materials |
| POST | `/api/resources/materials/` | Create a material |
| GET | `/api/resources/materials/{id}/` | Retrieve a material |
| PUT | `/api/resources/materials/{id}/` | Update a material |
| PATCH | `/api/resources/materials/{id}/` | Partially update a material |
| DELETE | `/api/resources/materials/{id}/` | Delete a material |

## `/api/service/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/service/attendance/` | Endpoint for students to see their attendance history. |
| GET | `/api/service/attendance/group-members/` | Endpoint for Service Admins to fetch the roster of their managed group |
| POST | `/api/service/attendance/mark/` | Bulk mark attendance for an event. |
| GET | `/api/service/attendance/my-history/` | Explicit endpoint for my history (alias for list view but clearer intent). |
| GET | `/api/service/attendance/{id}/` | Endpoint for students to see their attendance history. |
| GET | `/api/service/configuration/` | GET /api/service/configuration/ |
| GET | `/api/service/events/` | View for Events. |
| POST | `/api/service/events/` | View for Events. |
| GET | `/api/service/events/my-events/` | Events created by the requesting user (EventManager's own list). |
| GET | `/api/service/events/{id}/` | View for Events. |
| PUT | `/api/service/events/{id}/` | View for Events. |
| PATCH | `/api/service/events/{id}/` | View for Events. |
| DELETE | `/api/service/events/{id}/` | View for Events. |
| GET | `/api/service/events/{id}/roster/` | GET /api/service/events/<id>/roster/?search= |
| GET | `/api/service/families/` | Families. A student, father or mother only ever sees their own family; the Super Admin and |
| GET | `/api/service/families/my-family/` | Endpoint: /api/service/families/my-family/ |
| POST | `/api/service/families/my-family/messages/` | Endpoint: POST /api/service/families/my-family/messages/  {body, to_student_id?} |
| GET | `/api/service/families/{id}/` | Families. A student, father or mother only ever sees their own family; the Super Admin and |
| GET | `/api/service/families/{id}/members/` | Endpoint: /api/service/families/{id}/members/ |
| GET | `/api/service/groups/` | Service Groups (Ministries). Students browse these to decide what to pick. |
| GET | `/api/service/groups/my-group/` | Returns the group managed by the current user (service admin). |
| GET | `/api/service/groups/my-membership/` | Returns the current user's active service group membership. |
| GET | `/api/service/groups/{id}/` | Service Groups (Ministries). Students browse these to decide what to pick. |
| PATCH | `/api/service/groups/{id}/` | Service Groups (Ministries). Students browse these to decide what to pick. |
| POST | `/api/service/groups/{id}/add-member/` | Accept a student into this group. A student can belong to one group at a time. |
| GET | `/api/service/groups/{id}/applicants/` | Students who chose this group (with their priority, skills and reason) and the current members. |
| GET | `/api/service/groups/{id}/members/` | Returns list of students who are active members of this group. |
| POST | `/api/service/groups/{id}/remove-member/` | Service Groups (Ministries). Students browse these to decide what to pick. |
| GET | `/api/service/groups/{id}/students/{student_id}/` | What a group's admin may know about one student of THIS group: someone who chose the group or is a member. |
| GET | `/api/service/selections/` | Endpoint for students to submit their top 3 service choices. |
| POST | `/api/service/selections/` | Overwrite create to handle bulk submission of 3 choices. |
| GET | `/api/service/selections/{id}/` | Endpoint for students to submit their top 3 service choices. |
| PUT | `/api/service/selections/{id}/` | Endpoint for students to submit their top 3 service choices. |
| PATCH | `/api/service/selections/{id}/` | Endpoint for students to submit their top 3 service choices. |
| DELETE | `/api/service/selections/{id}/` | Endpoint for students to submit their top 3 service choices. |

## `/api/student/`

| Method | Path | Summary |
|---|---|---|
| GET | `/api/student/departments/` | The departments a student can choose from (kept by the Super Admin). |
| GET | `/api/student/profiles/` | ViewSet for viewing and editing student profiles. |
| POST | `/api/student/profiles/` | ViewSet for viewing and editing student profiles. |
| GET | `/api/student/profiles/me/` | Custom endpoint to get/update the current user's profile. |
| PUT | `/api/student/profiles/me/` | Custom endpoint to get/update the current user's profile. |
| PATCH | `/api/student/profiles/me/` | Custom endpoint to get/update the current user's profile. |
| GET | `/api/student/profiles/{id}/` | ViewSet for viewing and editing student profiles. |
| PUT | `/api/student/profiles/{id}/` | ViewSet for viewing and editing student profiles. |
| PATCH | `/api/student/profiles/{id}/` | ViewSet for viewing and editing student profiles. |
| DELETE | `/api/student/profiles/{id}/` | ViewSet for viewing and editing student profiles. |

## `/auth/`

| Method | Path | Summary |
|---|---|---|
| POST | `/auth/jwt/create/` | POST /auth/jwt/create/ with the campus-friendly limits above. |
| POST | `/auth/jwt/refresh/` | Takes a refresh type JSON web token and returns an access type JSON web |
| POST | `/auth/jwt/verify/` | Takes a token and indicates if it is valid.  This view provides no |
| GET | `/auth/users/` | auth_users_list |
| POST | `/auth/users/` | auth_users_create |
| POST | `/auth/users/activation/` | auth_users_activation_create |
| GET | `/auth/users/me/` | auth_users_me_retrieve |
| PUT | `/auth/users/me/` | auth_users_me_update |
| PATCH | `/auth/users/me/` | auth_users_me_partial_update |
| DELETE | `/auth/users/me/` | auth_users_me_destroy |
| POST | `/auth/users/resend_activation/` | auth_users_resend_activation_create |
| POST | `/auth/users/reset_password/` | auth_users_reset_password_create |
| POST | `/auth/users/reset_password_confirm/` | auth_users_reset_password_confirm_create |
| POST | `/auth/users/reset_username/` | auth_users_reset_username_create |
| POST | `/auth/users/reset_username_confirm/` | auth_users_reset_username_confirm_create |
| POST | `/auth/users/set_password/` | auth_users_set_password_create |
| POST | `/auth/users/set_username/` | auth_users_set_username_create |
| GET | `/auth/users/{id}/` | auth_users_retrieve |
| PUT | `/auth/users/{id}/` | auth_users_update |
| PATCH | `/auth/users/{id}/` | auth_users_partial_update |
| DELETE | `/auth/users/{id}/` | auth_users_destroy |
