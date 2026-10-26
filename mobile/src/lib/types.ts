// Types describe the SHAPE of the data the server sends. They exist only while we write code:
// TypeScript uses them to warn us when we misspell a field or forget one.
// They are copied by hand from the backend (core/serializers.py), so keep them in step with it.

// GET /health/
export type HealthResponse = {
  status: string; // "ok"
};

// POST /auth/jwt/create/  (step 5)
export type TokenPair = {
  access: string; // short-lived key, sent with every request
  refresh: string; // long-lived key, used to get a new access key
};

// The account set-up block of the signed-in user (login slips, step 7)
export type SetupStatus = Record<string, unknown>;

// GET /auth/users/me/  (step 5)
export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: 'M' | 'F' | null;
  roles: string[]; // for example ["Student", "EventManager"]
  setup: SetupStatus | null;
};

// GET /api/student/profiles/me/  (step 7)
export type StudentProfile = {
  id: string;
  user_email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string | null;
  profile_image: string | null; // a full web address, or null
  batch_year: number | null; // year of study, 1 to 5
  department: string | null;
  telegram_username: string | null;
  personal_phone: string | null;
  home_address: string | null;
  dorm_block: number | null;
  dorm_room: number | null;
  status: 'IN_CAMPUS' | 'GRADUATED' | string;
};

// Lists from the server come in pages of 20: { count, next, previous, results }
export type Paginated<T> = {
  count: number;
  next: string | null; // full address of the next page, or null on the last one
  previous: string | null;
  results: T[];
};

// GET /api/service/events/  (step 8)
export type ServiceEvent = {
  id: number;
  title: string;
  description: string;
  start_date: string; // ISO text such as "2026-10-20T11:00:00+03:00"
  end_date: string;
  photo: string | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | string; // worked out by the server from the dates
  created_by_name: string | null;
  place_name: string | null;
  place_url: string | null;
  service_group: number | null; // null = an event for everyone
  service_group_name: string | null;
  can_take_attendance?: boolean; // true when the server lets THIS person take attendance for the event
};

// GET /api/service/attendance/  (my own records only)
export type EventAttendance = {
  id: number;
  event: number; // the event id
  event_title: string;
  event_date: string;
  status: 'PRESENT' | 'ABSENT' | string;
  remark: string | null;
  recorded_at: string;
};

// GET /api/notifications/  (step 9)
export type AppNotification = {
  id: number;
  title: string;
  message: string;
  notification_type: 'EVENT' | 'DONATION' | 'REMINDER' | 'SYSTEM' | 'QA' | string;
  is_read: boolean;
  created_at: string;
};

// GET /api/notifications/unread-count/
export type UnreadCount = {
  count: number;
};

// GET /api/course/semester-courses/my-attendance-summary/  (step 10): one entry per course I study
export type CourseSummary = {
  semester_course: string; // the id of the semester course (a UUID)
  course_title: string;
  academic_year: number;
  semester: number; // 1 or 2
  status: 'PLANNED' | 'OPEN' | 'COMPLETED' | string;
  sessions_held: number; // class days that already have attendance marked
  present: number;
  absent: number;
  percentage: number; // 0 to 100
};

// GET /api/course/semester-courses/{id}/
export type SemesterCourseDetail = {
  id: string;
  course: string; // the curriculum id, used to find the materials
  course_details: { id: string; title: string; description: string | null; batch_year: number };
  academic_year: number;
  semester: number;
  status: string;
};

// GET /api/course/sessions/?semester_course={id}  (one class day)
export type CourseSession = {
  id: string;
  semester_course: string;
  date: string; // "2026-10-14" (a date, no time)
  topic: string | null;
  teacher_name: string | null;
};

// GET /api/course/attendance/?mine=1  (my record for one class day)
export type CourseAttendanceRecord = {
  id: string;
  session: string; // the class day id
  status: 'PRESENT' | 'ABSENT' | string;
};

// GET /api/resources/materials/?course={id}
export type Material = {
  id: string;
  title: string;
  description: string | null;
  file: string | null; // full web address of the uploaded file
  url: string | null; // or an outside link
  material_type: 'COURSE' | 'SERVICE' | 'GENERAL' | string;
  created_at: string;
};

// POST /api/donations/initiate/  (step 11)
export type InitiateDonationResponse = {
  checkout_url: string; // Chapa's payment page
  tx_ref: string; // our reference for this payment
};

// GET /api/donations/verify/{tx_ref}/  (answers 200 when paid, 400 when not paid yet)
export type VerifyDonationResponse = {
  status: string;
  amount: string;
  currency: string;
  tx_ref: string;
  date: string;
  donor_name: string;
};

// GET /api/donations/my-history/
export type DonationHistoryItem = {
  id: number;
  fund_category: string;
  donated_at: string;
  payment: {
    amount: string; // a decimal as text, for example "10.00"
    currency: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | string;
    transaction_reference: string;
    created_at: string;
  };
};

// GET /api/public/overview/  (public: no sign-in needed)
export type PublicOverview = {
  stats: {
    active_students: number;
    graduates: number;
    service_groups: number;
    families: number;
    events: number;
    public_questions: number;
  };
  groups: { id: number; name: string; summary: string; photo: string | null }[];
};

// GET /api/attendance/badge/me/  (smart attendance): my personal QR text, signed by the server
export type MyBadge = {
  badge: string; // "FB1.<id>.<version>.<signature>"
  name: string;
  version: number;
};

// GET /api/attendance/sessions/open-for-me/  (one open attendance session I belong to)
export type AttendanceSession = {
  id: number;
  kind: 'event' | 'class_day';
  status: 'OPEN' | 'CLOSED';
  present: number;
  roster: number;
  checked_in?: boolean; // true when I am already marked present
  event?: { id: number; title: string; start_date: string; end_date: string };
  class_day?: { id: string; date: string; topic: string | null; course: string };
};

// POST /api/attendance/sessions/{id}/self-check-in/  (200 = marked; 400/409 carry {code, detail} instead)
export type SelfCheckInResponse = {
  ok?: boolean;
  already?: boolean;
};

// GET /api/attendance/sessions/current/?event_id=  and  POST sessions/open/  (the organizer's view of a session)
export type OrganizerSession = {
  id: number;
  kind: 'event' | 'class_day';
  status: 'OPEN' | 'CLOSED';
  present: number;
  roster: number;
  event?: { id: number; title: string; start_date: string; end_date: string };
};

// GET /api/attendance/sessions/{id}/code/  (the room code changes every 30 seconds)
export type RoomCode = {
  code: string; // "123456"
  seconds_left: number;
  qr: string; // "FS1.<session id>.<6 digits>", what the students' cameras read
  window_seconds: number;
  present: number;
  roster: number;
};

// POST /api/attendance/sessions/{id}/scan/  (400 answers carry the same shape with ok: false and a code)
export type ScanResult = {
  ok: boolean;
  already?: boolean;
  code?: string; // bad_badge, old_badge, not_on_roster, closed
  detail?: string;
  student?: { id: number; name: string; photo: string | null; batch_year: number | null; department: string | null };
};

// GET /api/service/events/{id}/roster/  (the people invited to the event, with their mark so far)
export type RosterPerson = {
  id: number;
  name: string;
  email: string;
  batch_year: number | null;
  department: string | null;
  status: 'PRESENT' | 'ABSENT' | null; // null = not marked yet
  method?: 'BADGE' | 'CODE' | 'MANUAL' | null; // how live attendance marked them; null = by hand
  standing?: string; // class days only: regular, at_risk, never, no_data
};

// GET /api/course/semester-courses/  (a coordinator sees the courses where they are named, plus any they study in)
export type CoordinatedCourse = {
  id: string;
  course_details: { id: string; title: string; batch_year: number };
  academic_year: number;
  semester: number;
  status: 'PLANNED' | 'OPEN' | 'COMPLETED' | string;
  coordinators: number[]; // user ids
  enrollment_count: number;
};

// GET /api/course/sessions/?semester_course={id}  (a class day, with how many students are marked)
export type ClassDay = {
  id: string;
  semester_course: string;
  date: string; // "2026-10-14"
  topic: string | null;
  teacher_name: string | null;
  marked_count: number;
};
