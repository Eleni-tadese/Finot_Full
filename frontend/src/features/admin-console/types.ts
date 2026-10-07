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
  setup?: { pending: boolean; required: boolean; deadline: string; days_left: number } | null;
}

export interface UserFilterOptions {
  batches: number[];
  departments: string[];
  dorm_blocks: number[];
  sections: number[];
  groups: { id: number; name: string }[];
}

export interface Overview {
  users: { total: number; active: number; students: number; by_role: Record<string, number> };
  events: { upcoming: number; total: number };
  families: { total: number; unassigned_freshers: number };
  qa: { public_pending: number; private_total: number; private_unanswered: number; needs_assignment: number };
  sms: { enabled: boolean; monthly_limit: number; sent_this_month: number };
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
  gender: "M" | "F" | null;
  member_count: number;
}

export interface FamilyRow {
  id: number;
  name: string;
  gender: string | null;
  member_count: number;
  father: { id: number; full_name: string; email: string } | null;
  mother: { id: number; full_name: string; email: string } | null;
  religious_father: string;
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

export interface SmsSettings {
  enabled: boolean;
  monthly_limit: number;
  sent_this_month: number;
  remaining_this_month: number;
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
