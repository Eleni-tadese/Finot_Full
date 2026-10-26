// Smart attendance: the calls to /api/attendance/ (backend app `attendance`). Shapes copied from attendance/views.py.
import axiosInstance from "../../lib/axios";

export interface StudentCard {
  id: number;
  name: string;
  photo: string | null;
  batch_year: number | null;
  department: string | null;
}

export interface AttendanceSession {
  id: number;
  kind: "event" | "class_day";
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  auto_close_at: string;
  opened_by: string | null;
  helpers: { id: number; name: string }[];
  present: number;
  roster: number;
  event?: { id: number; title: string; start_date: string; end_date: string };
  class_day?: { id: string; date: string; topic: string | null; course: string };
  checked_in?: boolean; // only in open-for-me
}

export interface ScanResult {
  ok: boolean;
  already?: boolean;
  code?: string; // error code: bad_badge, old_badge, not_on_roster, closed
  detail?: string;
  student?: StudentCard;
  checked_in_at?: string;
  present?: number;
  roster?: number;
}

export interface RoomCode {
  code: string;
  seconds_left: number;
  qr: string;
  window_seconds: number;
  present: number;
  roster: number;
}

export type Target = { event_id: number } | { course_session_id: string };

// Charts and simple predictions (backend attendance/insights.py)
export interface InsightRow {
  id: number | string;
  title: string;
  date: string; // event start (ISO) or class day (YYYY-MM-DD)
  group?: string | null;
  topic?: string;
  roster: number;
  present: number;
  absent: number;
  unmarked: number;
  rate: number; // present / roster, in %
  counted: boolean; // at least one Present/Absent row exists
}

export interface Insights {
  events: InsightRow[];
  at_risk: { id: number; name: string; batch_year: number | null; department: string | null }[];
  at_risk_total: number;
  next: { id: number | string; title: string; date: string; roster: number; expected_rate: number | null; expected_present: number | null; based_on: number } | null;
  average_rate: number | null;
  last_n: number;
}

export interface MyInsights {
  months: { month: string; events_present: number; events_absent: number; classes_present: number; classes_absent: number }[];
  streak: number;
}

const base = "/api/attendance/";

export const attendanceApi = {
  open: (target: Target) => axiosInstance.post<AttendanceSession>(base + "sessions/open/", target).then((r) => r.data),
  current: (target: Target) =>
    axiosInstance.get<AttendanceSession>(base + "sessions/current/", { params: target }).then((r) => r.data),
  session: (id: number) => axiosInstance.get<AttendanceSession>(`${base}sessions/${id}/`).then((r) => r.data),
  close: (id: number) =>
    axiosInstance.post<AttendanceSession & { marked_absent: number; final?: boolean }>(`${base}sessions/${id}/close/`).then((r) => r.data),
  reopen: (id: number) => axiosInstance.post<AttendanceSession>(`${base}sessions/${id}/reopen/`).then((r) => r.data),
  setHelpers: (id: number, userIds: number[]) =>
    axiosInstance.post<AttendanceSession>(`${base}sessions/${id}/helpers/`, { user_ids: userIds }).then((r) => r.data),
  code: (id: number) => axiosInstance.get<RoomCode>(`${base}sessions/${id}/code/`).then((r) => r.data),
  /** One badge. A refused badge comes back as HTTP 400 with the same shape, so we read the body in both cases. */
  scan: (id: number, badge: string, scannedAt?: string) =>
    axiosInstance
      .post<ScanResult>(`${base}sessions/${id}/scan/`, { badge, scanned_at: scannedAt }, { validateStatus: (s) => s === 200 || s === 400 })
      .then((r) => r.data),
  sync: (id: number, scans: { badge: string; scanned_at?: string }[]) =>
    axiosInstance
      .post<{ results: ScanResult[]; accepted: number; present: number; roster: number }>(`${base}sessions/${id}/sync/`, { scans })
      .then((r) => r.data),
  myBadge: () => axiosInstance.get<{ badge: string; name: string; version: number }>(base + "badge/me/").then((r) => r.data),
  openForMe: () => axiosInstance.get<AttendanceSession[]>(base + "sessions/open-for-me/").then((r) => r.data),
  eventInsights: (scope: "all" | "mine" | "group", groupId?: number) =>
    axiosInstance.get<Insights>(base + "insights/events/", { params: { scope, group_id: groupId } }).then((r) => r.data),
  courseInsights: (semesterCourseId: string) => axiosInstance.get<Insights>(`${base}insights/courses/${semesterCourseId}/`).then((r) => r.data),
  myInsights: () => axiosInstance.get<MyInsights>(base + "insights/me/").then((r) => r.data),
  selfCheckIn: (id: number, code: string) =>
    axiosInstance
      .post<{ ok?: boolean; already?: boolean; code?: string; detail?: string; session?: AttendanceSession }>(
        `${base}sessions/${id}/self-check-in/`, { code }, { validateStatus: (s) => s === 200 || s === 400 || s === 409 },
      )
      .then((r) => r.data),
};

/** The server's short error codes -> translation keys (texts live in the locale files). */
export const ERROR_KEYS: Record<string, string> = {
  bad_badge: "att_err_bad_badge",
  old_badge: "att_err_old_badge",
  not_on_roster: "att_err_not_on_roster",
  closed: "att_err_closed",
  wrong_code: "att_err_wrong_code",
  forbidden: "att_err_forbidden",
  another_open: "att_err_another_open",
  not_today: "att_err_not_today",
  not_yet: "att_err_not_yet",
  ended: "att_err_ended",
};

/** Text of the organizer's big QR: "FS1.<session id>.<6 digits>". Returns null for anything else. */
export function parseRoomQr(text: string): { sessionId: number; code: string } | null {
  const m = /^FS1\.(\d+)\.(\d{6})$/.exec(text.trim());
  return m ? { sessionId: Number(m[1]), code: m[2] } : null;
}

export const isBadge = (text: string) => /^FB1\.\d+\.\d+\.[0-9a-f]{16}$/.test(text.trim());
