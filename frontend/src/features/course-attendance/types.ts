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
