export interface ReportStudentRow {
  student_id: number;
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  present: number;
  absent: number;
  unmarked: number;
  percentage: number;
  standing?: "regular" | "at_risk" | "never" | "no_data";
  display_name?: string; // the name, or "Slip f00012" while the student has not written it
  name_missing?: boolean;
  is_slip?: boolean;
  email?: string;
  phone?: string;
  /** status on each class day, by session id; a missing day was not marked */
  days: Record<string, "PRESENT" | "ABSENT">;
}

export interface ReportSession {
  id: string;
  date: string;
  topic: string;
  marked: boolean;
}

export interface CourseAttendanceReport {
  semester_course: string;
  course_title: string;
  batch_year: number;
  academic_year: number;
  semester: number;
  status: string;
  sessions_total: number;
  sessions_held: number;
  student_count: number;
  average_percentage: number;
  standing_counts?: { regular: number; at_risk: number; never: number; no_data: number };
  regular_from?: number;
  sessions: ReportSession[];
  students: ReportStudentRow[];
}

export interface StudentCourseSummary {
  semester_course: string;
  course_title: string;
  academic_year: number;
  semester: number;
  sessions_held: number;
  present: number;
  absent: number;
  percentage: number;
}
