import axiosInstance from "../../lib/axios";
import type { PersonCard } from "../../components/people/StudentCard";
import type { Credential } from "./slips";
import type {
  AdminGroup, AdminUser, FamilyRow, ImportBatchRow, ImportPreview, ImportRow, SlipProgress, Counselor, SubAdminRole, DistributionBatch, DistributionOverview, DistributionPreview, Overview,
  Curriculum, SemesterCourseRow, DonationsPage, UserFilterOptions, Department, AcademicYearData, Paginated, PrivateQuestion, RoleOption, SmsLogRow, SmsSettings, Specialization, EmailSettings, EmailOutboxRow,
} from "./types";

const C = "/api/admin-console";

/** Follows DRF pagination until every row is loaded. */
async function fetchAll<T>(url: string): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = url;
  while (next) {
    const { data }: { data: any } = await axiosInstance.get(next);
    if (Array.isArray(data)) return data as T[];
    rows.push(...(data.results ?? []));
    next = data.next ? new URL(data.next).pathname.replace(/^\/?/, "/") + new URL(data.next).search : null;
  }
  return rows;
}

const unwrap = <T,>(data: any): T[] => (Array.isArray(data) ? data : data?.results ?? []);

export const adminApi = {
  overview: () => axiosInstance.get<Overview>(`${C}/overview/`).then((r) => r.data),
  roles: () => axiosInstance.get<RoleOption[]>(`${C}/roles/`).then((r) => r.data),

  recheckDonations: () =>
    axiosInstance.post<{ checked: number; completed: number; failed: number; left: number }>(`${C}/donations/recheck/`).then((r) => r.data),
  donations: (params: Record<string, string | number | undefined>) =>
    axiosInstance.get<DonationsPage>(`${C}/donations/`, { params }).then((r) => r.data),

  users: (params: Record<string, string | number | undefined>) =>
    axiosInstance.get<Paginated<AdminUser>>(`${C}/users/`, { params }).then((r) => r.data),
  familyPeople: (search: string) =>
    axiosInstance.get<{ results: AdminUser[] }>(`${C}/families/people/`, { params: { search } }).then((r) => r.data),
  importTemplate: () => axiosInstance.get(`${C}/accounts/import/template/`, { responseType: "blob" }).then((r) => r.data as Blob),
  importPreview: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return axiosInstance.post<ImportPreview>(`${C}/accounts/import/preview/`, form).then((r) => r.data);
  },
  importCommit: (body: { batch_id?: number | null; grace_days?: number; rows: Partial<ImportRow>[] }) =>
    axiosInstance
      .post<{ batch_id: number; created: Credential[]; rejected: { row: number; errors: string[] }[] }>(`${C}/accounts/import/commit/`, body)
      .then((r) => r.data),
  importBlank: (body: { count: number; batch_id?: number | null; grace_days?: number }) =>
    axiosInstance
      .post<{ batch_id: number; created: Credential[]; rejected: { row: number; errors: string[] }[] }>(`${C}/accounts/import/blank/`, body)
      .then((r) => r.data),
  importBatches: () => axiosInstance.get<{ results: ImportBatchRow[] }>(`${C}/accounts/import/batches/`).then((r) => r.data.results),
  slipProgress: (params: { state?: string; q?: string; batch?: number | null; page?: number }) =>
    axiosInstance.get<SlipProgress>(`${C}/accounts/import/progress/`, { params }).then((r) => r.data),
  slipProgressExport: (params: { state?: string; q?: string; batch?: number | null }) =>
    axiosInstance.get(`${C}/accounts/import/progress/export/`, { params, responseType: "blob" }).then((r) => r.data as Blob),
  undoImport: (id: number) =>
    axiosInstance.post<{ deleted: number; kept: number }>(`${C}/accounts/import/batches/${id}/undo/`).then((r) => r.data),
  reissueSlip: (id: number) =>
    axiosInstance.post<{ name: string; email: string; password: string; grace_days: number; deadline: string }>(`${C}/users/${id}/reissue/`).then((r) => r.data),
  userCard: (id: number) => axiosInstance.get<PersonCard>(`${C}/users/${id}/`).then((r) => r.data),
  userFilterOptions: () => axiosInstance.get<UserFilterOptions>(`${C}/users/filters/`).then((r) => r.data),
  updateUser: (
    id: number,
    body: {
      is_active?: boolean; roles?: string[]; add_role?: string; remove_role?: string;
      batch_year?: number | null; department?: string; student_status?: string;
    },
  ) =>
    axiosInstance.patch<AdminUser>(`${C}/users/${id}/`, body).then((r) => r.data),

  selectionWindow: () => axiosInstance.get<{ is_selection_open: boolean }>(`${C}/service-config/`).then((r) => r.data),
  setSelectionWindow: (open: boolean) =>
    axiosInstance.patch<{ is_selection_open: boolean }>(`${C}/service-config/`, { is_selection_open: open }).then((r) => r.data),
  families: () => axiosInstance.get<{ results: FamilyRow[] }>(`${C}/families/`).then((r) => r.data.results),
  deleteFamily: (id: number) => axiosInstance.delete<{ removed_students: number }>(`${C}/families/${id}/`).then((r) => r.data),
  updateFamily: (id: number, body: { name?: string; father_id?: number | null; mother_id?: number | null; religious_father?: string }) =>
    axiosInstance.patch<FamilyRow>(`${C}/families/${id}/`, body).then((r) => r.data),
  createFamily: (body: { name: string; gender: string; father_id?: number | null; mother_id?: number | null; religious_father?: string }) =>
    axiosInstance.post<{ id: number; name: string }>(`${C}/families/`, body).then((r) => r.data),

  subAdmins: () => axiosInstance.get<SubAdminRole[]>(`${C}/sub-admins/`).then((r) => r.data),
  serviceGroups: () => axiosInstance.get<AdminGroup[]>(`${C}/service-groups/`).then((r) => r.data),
  createGroup: (data: FormData) =>
    axiosInstance.post<AdminGroup>(`${C}/service-groups/`, data, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  updateGroup: (id: number, data: FormData) =>
    axiosInstance.patch<AdminGroup>(`${C}/service-groups/${id}/`, data, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  deleteGroup: (id: number) => axiosInstance.delete(`${C}/service-groups/${id}/`).then(() => undefined),
  setGroupAdmin: (groupId: number, userId: number | null) =>
    axiosInstance.put(`${C}/service-groups/${groupId}/admin/`, { user_id: userId }).then((r) => r.data),

  counselors: () => axiosInstance.get<Counselor[]>(`${C}/qa/counselors/`).then((r) => r.data),
  setSpecializations: (id: number, specializations: Specialization[]) =>
    axiosInstance.put(`${C}/qa/counselors/${id}/specializations/`, { specializations }).then((r) => r.data),
  privateQuestions: () =>
    axiosInstance.get("/api/qa/questions/counselor-queue/").then((r) => unwrap<PrivateQuestion>(r.data)),
  assignQuestion: (questionId: string, counselorIds: number[]) =>
    axiosInstance.post<PrivateQuestion>(`/api/qa/questions/${questionId}/assign/`, { counselor_ids: counselorIds }).then((r) => r.data),

  distribution: () => axiosInstance.get<DistributionOverview>(`${C}/families/distribution/`).then((r) => r.data),
  previewDistribution: (body: { family_ids: number[]; gender?: string; dorm_block?: string; section?: string }) =>
    axiosInstance.post<DistributionPreview>(`${C}/families/distribution/preview/`, body).then((r) => r.data),
  autoPreviewDistribution: () =>
    axiosInstance.post<DistributionPreview>(`${C}/families/distribution/auto-preview/`).then((r) => r.data),
  confirmDistribution: (pairs: [number, number][], newFamilies?: { temp_id: number; name: string }[]) =>
    axiosInstance
      .post<{ applied: number; skipped: string[]; batch: DistributionBatch | null }>(`${C}/families/distribution/confirm/`, { pairs, new_families: newFamilies ?? [] })
      .then((r) => r.data),
  undoDistribution: (batchId: number) =>
    axiosInstance.post<{ removed: number }>(`${C}/families/distribution/batches/${batchId}/undo/`).then((r) => r.data),

  smsSettings: () => axiosInstance.get<SmsSettings>(`${C}/sms/settings/`).then((r) => r.data),
  updateSmsSettings: (body: Partial<Pick<SmsSettings, "enabled" | "monthly_limit">>) =>
    axiosInstance.patch<SmsSettings>(`${C}/sms/settings/`, body).then((r) => r.data),
  smsLogs: (params: { status?: string; page?: number }) =>
    axiosInstance.get<Paginated<SmsLogRow>>(`${C}/sms/logs/`, { params }).then((r) => r.data),
  // Email outbox
  emailSettings: () => axiosInstance.get<EmailSettings>(`${C}/email/settings/`).then((r) => r.data),
  updateEmailSettings: (body: { daily_limit: number }) =>
    axiosInstance.patch<EmailSettings>(`${C}/email/settings/`, body).then((r) => r.data),
  emailOutbox: (params: { status?: string; page?: number }) =>
    axiosInstance.get<Paginated<EmailOutboxRow>>(`${C}/email/outbox/`, { params }).then((r) => r.data),
  retryFailedEmails: () => axiosInstance.post<{ retried: number }>(`${C}/email/outbox/retry/`).then((r) => r.data),
  sendEmailsNow: () => axiosInstance.post<{ started: boolean }>(`${C}/email/outbox/send/`).then((r) => r.data),
  // Departments and the yearly rollover
  departments: () => axiosInstance.get<Department[]>(`${C}/departments/`).then((r) => r.data),
  createDepartment: (name: string, years: number) =>
    axiosInstance.post<Department>(`${C}/departments/`, { name, years }).then((r) => r.data),
  updateDepartment: (id: number, body: { name?: string; years?: number; is_active?: boolean }) =>
    axiosInstance.patch<Department>(`${C}/departments/${id}/`, body).then((r) => r.data),
  deleteDepartment: (id: number) => axiosInstance.delete(`${C}/departments/${id}/`).then(() => undefined),
  academicYear: () => axiosInstance.get<AcademicYearData>(`${C}/academic-year/`).then((r) => r.data),
  startNewYear: (label: string, force: boolean) =>
    axiosInstance.post(`${C}/academic-year/rollover/`, { label, force }).then((r) => r.data),
  undoYear: (id: number) =>
    axiosInstance.post<{ restored: number; skipped: number }>(`${C}/academic-year/rollover/${id}/undo/`).then((r) => r.data),

  // Courses (curriculums, semester offerings, enrolment)
  curriculums: () => fetchAll<Curriculum>("/api/course/curriculums/"),
  saveCurriculum: (id: string | null, body: Partial<Curriculum>) =>
    (id
      ? axiosInstance.patch<Curriculum>(`/api/course/curriculums/${id}/`, body)
      : axiosInstance.post<Curriculum>("/api/course/curriculums/", body)
    ).then((r) => r.data),
  deleteCurriculum: (id: string) => axiosInstance.delete(`/api/course/curriculums/${id}/`).then(() => undefined),
  semesterCourses: () => fetchAll<SemesterCourseRow>("/api/course/semester-courses/"),
  saveSemesterCourse: (id: string | null, body: { course: string; academic_year: number; semester: number; coordinators: number[] }) =>
    (id
      ? axiosInstance.patch<SemesterCourseRow>(`/api/course/semester-courses/${id}/`, body)
      : axiosInstance.post<SemesterCourseRow>("/api/course/semester-courses/", body)
    ).then((r) => r.data),
  deleteSemesterCourse: (id: string) => axiosInstance.delete(`/api/course/semester-courses/${id}/`).then(() => undefined),
  bulkEnroll: (semesterCourseId: string, batchYear: number) =>
    axiosInstance
      .post<{ message: string; requested_students: number; new_enrollments: number }>(
        `/api/course/enrollments/bulk-enroll/${semesterCourseId}/`, { batch_year: batchYear })
      .then((r) => r.data),
};

export const PAGE_SIZE = 20;
