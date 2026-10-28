export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RoleOption {
  name: string;
  label: string;
  min_year?: number | null;
  via_group?: boolean;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  is_active: boolean;
  roles: string[];
  date_joined: string;
  gender: "M" | "F" | null;
  batch_year: number | null;
  department: string;
  dorm_block: number | null;
  section: number | null;
  service_group: string | null;
  student_status: "IN_CAMPUS" | "GRADUATED" | null;
  setup?: { pending: boolean; expired: boolean; needs_name: boolean; deadline: string; days_left: number } | null;
}

export interface UserFilterOptions {
  batches: number[];
  departments: string[];
  dorm_blocks: number[];
  sections: number[];
  groups: { id: number; name: string }[];
  /** head count per choice: counts[filterKey][value]; department values are lower case */
  counts?: Record<string, Record<string, number>>;
}

export interface Overview {
  users: {
    total: number;
    active: number;
    real: number; // email is not a slip address (same rule as Users & roles > Real accounts)
    real_active: number;
    slips_used: number; // slip accounts that signed in at least once
    slips_unused: number;
    students: number;
    students_real: number;
    by_role: Record<string, number>;
  };
  events: { upcoming: number; total: number };
  families: { total: number; unassigned_freshers: number };
  qa: { public_pending: number; private_total: number; private_unanswered: number; needs_assignment: number };
  sms: { enabled: boolean; monthly_limit: number; sent_this_month: number };
  email: { waiting: number; failed: number; sent_today: number; daily_limit: number };
  donations?: { collected: number | string; completed: number; pending: number; failed: number };
}

export interface DonationRow {
  id: number;
  date: string;
  donor: string;
  kind: "student" | "guest";
  email: string;
  fund: string;
  fund_label: string;
  amount: number | string;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reference: string;
}

export interface DonationsPage extends Paginated<DonationRow> {
  summary: {
    collected: number | string;
    completed: number;
    pending: number;
    failed: number;
    by_fund: { key: string; label: string; amount: number | string }[];
  };
}

export type Specialization = "ACADEMIC" | "SOUL_TEACHER" | "FAMILY" | "PSYCHOTHERAPIST" | "OTHER";

export const SPECIALIZATIONS: { value: Specialization; label: string }[] = [
  { value: "ACADEMIC", label: "Academic" },
  { value: "SOUL_TEACHER", label: "Spiritual (soul teacher)" },
  { value: "FAMILY", label: "Family" },
  { value: "PSYCHOTHERAPIST", label: "Personal (psychotherapist)" },
  { value: "OTHER", label: "Other" },
];

export interface Counselor {
  id: number;
  full_name: string;
  email: string;
  specializations: Specialization[];
  assigned_count: number;
}

export interface PrivateQuestion {
  id: string;
  category: string;
  question_body: string;
  created_at: string;
  asker_name: string | null;
  specialization: Specialization | null;
  assigned_to: { id: number; name: string }[];
  needs_assignment: boolean;
  answer_count: number;
  answers?: { id: number; answer_body: string; display_name: string }[];
}

export interface FamilyOption {
  id: number;
  name: string;
  member_count: number;
}

export interface FamilyRow {
  id: number;
  name: string;
  member_count: number;
  father: { id: number; full_name: string; email: string } | null;
  mother: { id: number; full_name: string; email: string } | null;
  religious_father: string;
}

export interface ParentCandidate { id: number; full_name: string; email: string; year: number; department: string }
export interface ParentCandidates {
  fathers: ParentCandidate[];
  mothers: ParentCandidate[];
  families_without_father: number;
  families_without_mother: number;
}
export interface AssignParentsResult {
  applied: number;
  failed: number;
  results: { family_id: number | null; family_name: string; ok: boolean; errors: Record<string, string> }[];
}

export interface DistributionBatch {
  id: number;
  created_at: string;
  created_by: string | null;
  student_count: number;
  undone_at: string | null;
}

export interface DistributionOverview {
  limit: number;
  unassigned_count: number;
  filter_options: { dorm_blocks: number[]; dorm_rooms: number[]; sections: number[] };
  families: FamilyOption[];
  batches: DistributionBatch[];
}

export interface DistributionPreview {
  rows: {
    family_id: number;
    family_name: string;
    current: number;
    after: number;
    added: { id: number; name: string; dorm_block: number | null; section: number | null }[];
    is_new?: boolean;
    female?: number;
    male?: number;
  }[];
  pairs: [number, number][];
  new_families?: { temp_id: number; name: string }[];
  total_added: number;
  unplaced: { id: number; name: string; reason: string }[];
  limit: number;
}

/** The Family Admin's rules for one distribution (see the rules panel on the Families page). */
export type SpreadMode = "mix" | "together" | "ignore";
export type Factor = "section" | "dorm" | "gender";

export interface Spread { value: number | null; count: number; women?: number; men?: number }

export interface RatioOption {
  female: number;
  male: number;
  families_full: number;
  left_female: number;
  left_male: number;
  left_total: number;
}

export interface DistributionSetup {
  students: { total: number; women: number; men: number; no_gender: number };
  sections: Spread[];
  dorm_blocks: Spread[];
  rooms: { students_with_room: number; rooms: number; shared: number; largest: number };
  size: number;
  default_size: number;
  families: number;
  ratios: RatioOption[];
}

export interface PlanRules {
  size: number;
  female_per_family: number;
  male_per_family: number;
  section_mode: SpreadMode;
  dorm_mode: SpreadMode;
  dorm_level: "room" | "block";
  priority: Factor[];
  place_remaining?: boolean;
}

export interface PlanPerson { id: number; name: string; gender: "M" | "F" | null; section: number | null; dorm_block: number | null }

export interface PlanResult {
  rows: {
    family_id: number;
    family_name: string;
    total: number;
    women: number;
    men: number;
    sections: Spread[];
    dorm_blocks: Spread[];
    members: PlanPerson[];
  }[];
  new_families: { temp_id: number; name: string }[];
  pairs: [number, number][];
  remaining: (PlanPerson & { reason: string })[];
  summary: { students: number; placed: number; remaining: number; families: number; size: number };
}

export interface PoolPerson {
  id: number;
  full_name: string;
  email: string;
  gender: "M" | "F" | null;
  year: number | null;
  department: string;
}

export interface PoolChosen extends PoolPerson {
  status: "SELECTED" | "TRAINED";
  note: string;
  assigned: boolean;
  selected_by: string;
}

export interface ParentPool { chosen: PoolChosen[]; suggestions: PoolPerson[] }

export interface SmsSettings {
  enabled: boolean;
  monthly_limit: number;
  sent_this_month: number;
  remaining_this_month: number;
}

/** Super Admin > Messages > Email (backend notifications/outbox.py). */
export interface EmailSettings {
  daily_limit: number;
  test_notice: string; // shown at the top of every email while not empty
  sent_today: number;
  remaining_today: number;
  waiting: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface EmailOutboxRow {
  id: number;
  created_at: string;
  sent_at: string | null;
  not_after: string | null;
  user: string | null;
  email: string;
  kind: "NEW_EVENT" | "EVENT_TOMORROW";
  event: string | null;
  subject: string;
  status: "WAITING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  error: string;
}

export interface SmsLogRow {
  id: number;
  created_at: string;
  user: string | null;
  phone: string;
  trigger: string;
  status: "SENT" | "FAILED" | "LIMIT_REACHED" | "INVALID_PHONE";
  provider: string;
  error: string;
}

export interface SubAdminMember {
  id: number;
  full_name: string;
  email: string;
  is_active: boolean;
  detail: string;
}

export interface SubAdminRole {
  name: string;
  label: string;
  description: string;
  min_year?: number | null;
  members: SubAdminMember[];
}

export interface AdminGroup {
  id: number;
  name: string;
  summary: string;
  description: string;
  activities: string;
  requirements: string;
  commitment: string;
  contact_info: string;
  photo: string | null;
  video_url: string;
  admin: { id: number; full_name: string; email: string } | null;
  member_count: number | null;
  updated_at: string;
}

/** Sub-admins page only needs these. */
export type ServiceGroupRow = Pick<AdminGroup, "id" | "name" | "admin">;

export interface Curriculum {
  id: string;
  title: string;
  description: string | null;
  batch_year: number;
  is_active: boolean;
}

export interface SemesterCourseRow {
  id: string;
  course: string;
  course_details: Curriculum;
  academic_year: number;
  semester: number;
  coordinators: number[];
  coordinators_details: { id: number; first_name: string; middle_name?: string; last_name: string; email: string }[];
  enrollment_count?: number;
  status?: "PLANNED" | "OPEN" | "COMPLETED";
}

export interface Department {
  id: number;
  name: string;
  years: number;
  is_active: boolean;
  is_stage: boolean; // Pre-Science, Pre-Engineering, a school: students on it choose again later
  leads_to: number[]; // ids a student on this stage may choose next (empty = any)
  leads_to_names: string[];
  effective_years: number; // for a stage: the longest program it leads to
  student_count: number;
}

export interface RolloverPreview {
  by_year: { year: number; count: number; graduating: number }[];
  promote: number;
  graduate: number;
  unknown_year: number;
  unknown_department: number;
  graduating_by_department: { department: string; count: number }[];
  graduating_with_roles: { name: string; roles: string[] }[];
  too_soon: boolean;
  last_run_at: string | null;
  default_years: number;
}

export interface RolloverRun {
  id: number;
  label: string;
  performed_at: string;
  performed_by: string | null;
  promoted: number;
  graduated: number;
  skipped: number;
  undone_at: string | null;
  can_undo: boolean;
}

export interface AcademicYearData {
  preview: RolloverPreview;
  history: RolloverRun[];
}

export interface ImportRow {
  row: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string | null;
  department: string;
  phone: string;
  dorm_block: number | null;
  dorm_room: number | null;
  section: number | null;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  chunk_limit: number;
  grace_days: number;
}

export type SlipStep = "never" | "no_name" | "on_slip" | "needs_password" | "done";
export type SlipFilter = SlipStep | "expired" | "not_done" | "";

export interface SlipSummary {
  total: number;
  never: number;
  no_name: number;
  on_slip: number;
  needs_password: number;
  done: number;
  expired: number;
}

export interface SlipRow {
  id: number;
  name: string;
  email: string;
  step: SlipStep;
  expired: boolean;
  deadline: string;
  days_left: number;
  last_login: string | null;
  batch: number | null;
}

export interface SlipProgress {
  summary: SlipSummary;
  count: number;
  next: string | null;
  previous: string | null;
  results: SlipRow[];
}

export interface ImportBatchRow {
  id: number;
  created_at: string;
  created_by: string | null;
  grace_days: number;
  undone_at: string | null;
  created: number;
  signed_in: number;
  completed: number;
}
