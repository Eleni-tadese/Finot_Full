import { ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiBookOpen, FiCalendar, FiCheckCircle, FiClipboard, FiFileText, FiLink, FiUser } from "react-icons/fi";
import { Card, SectionHeader } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { api } from "../../lib/api";
import { formatDay, parseYmd, ymd } from "../../lib/dates";
import CourseSchedule from "../../components/course/CourseSchedule";
import CourseStatusBadge from "../../components/course/CourseStatusBadge";
import { useAuth } from "../../context/AuthContext";
import { hasRole } from "../../features/auth/roles";

interface CourseRow {
  id: string;
  course: string;
  status: "PLANNED" | "OPEN" | "COMPLETED";
  course_details: { id: string; title: string; description: string | null; batch_year: number };
  academic_year: number;
  semester: number;
  coordinators_details: { first_name: string; middle_name?: string; last_name: string }[];
}
interface Summary { semester_course: string; sessions_held: number; present: number; absent: number; percentage: number | null }
interface Session { id: string; date: string; topic: string | null; teacher_name: string | null }
interface Material { id: number; title: string; description: string | null; file: string | null; url: string | null }

const personName = (p: { first_name: string; middle_name?: string; last_name: string }) => [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ");

/** Circle with the attendance percentage in the middle. */
const Ring = ({ pct }: { pct: number | null }) => {
  const r = 38;
  const c = 2 * Math.PI * r;
  const value = pct ?? 0;
  const color = pct === null ? "stroke-border" : value >= 75 ? "stroke-emerald-500" : value >= 50 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={r} className="fill-none stroke-border" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} className={`fill-none ${color} transition-all duration-700`} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-foreground">{pct === null ? "—" : `${Math.round(value)}%`}</span>
    </div>
  );
};

type Tab = "attendance" | "days" | "materials";

/** One course the student is enrolled in: how they are doing, what is next, the class days, the materials. */
const CourseCard = ({ row, summary, attendance }: { row: CourseRow; summary?: Summary; attendance: Record<string, string> }) => {
  const { t, i18n } = useTranslation();
  const completed = row.status === "COMPLETED";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tab, setTab] = useState<Tab>(completed ? "attendance" : "days");

  useEffect(() => {
    api.getCourseSessions(row.id)
      .then((all) => setSessions([...all].sort((a: Session, b: Session) => (a.date < b.date ? -1 : 1))))
      .catch(() => setSessions([]));
    api.getMaterials({ type: "COURSE", course: row.course }).then(setMaterials).catch(() => setMaterials([]));
  }, [row.id, row.course]);

  const today = ymd(new Date());
  const next = sessions.find((s) => s.date >= today);
  const daysLeft = next ? Math.round((parseYmd(next.date).getTime() - parseYmd(today).getTime()) / 86400000) : null;
  // every day that was marked for this student, newest first
  const marked = useMemo(() => [...sessions].filter((s) => attendance[s.id]).reverse(), [sessions, attendance]);

  const pct = summary?.percentage ?? null;
  const semester = row.semester === 1 ? t("crs_sem_1", "First semester") : t("crs_sem_2", "Second semester");

  const tabButton = (key: Tab, label: string, icon: ReactNode, count?: number) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {icon}{label}{count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs">{count}</span>}
    </button>
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className={`border-b border-border px-5 py-4 ${completed ? "bg-muted/60" : "bg-primary/5"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-foreground">{row.course_details.title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{row.academic_year} · {semester}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CourseStatusBadge status={row.status} />
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{t("flt_batch_n", "Batch {{n}}", { n: row.course_details.batch_year })}</span>
          </div>
        </div>
        {row.course_details.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.course_details.description}</p>}
        {row.coordinators_details.length > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FiUser className="h-3.5 w-3.5" />{t("crs_coordinators", "Coordinators")}: {Array.from(new Set(row.coordinators_details.map(personName))).join(", ")}
          </p>
        )}
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="text-sm">
            <p className="font-semibold text-foreground">{t("mc_attendance", "My attendance")}</p>
            <p className="mt-0.5 text-muted-foreground">
              {summary && summary.sessions_held > 0
                ? t("mc_attendance_detail", "Present {{p}} · Absent {{a}} · {{n}} class day(s) held", { p: summary.present, a: summary.absent, n: summary.sessions_held })
                : t("mc_no_attendance", "No attendance has been taken yet.")}
            </p>
          </div>
        </div>

        {completed ? (
          <div className="flex items-center gap-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            <FiCheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
            {t("mc_completed_note", "This course is completed. Your attendance and the materials stay here.")}
          </div>
        ) : next ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("sch_next", "Next class")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatDay(next.date, i18n.language)}</p>
            <p className="text-sm text-muted-foreground">
              {daysLeft === 0 ? t("sch_today", "Today") : daysLeft === 1 ? t("sch_tomorrow", "Tomorrow") : t("mc_in_days", "in {{n}} days", { n: daysLeft })}
              {next.topic ? ` · ${next.topic}` : ""}
              {next.teacher_name ? ` · ${t("teacher", "Teacher")}: ${next.teacher_name}` : ""}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("mc_no_next", "No upcoming class day.")}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-y border-border px-3">
        {tabButton("attendance", t("mc_tab_attendance", "Attendance"), <FiClipboard className="h-4 w-4" />, marked.length)}
        {tabButton("days", t("mc_class_days", "Class days"), <FiCalendar className="h-4 w-4" />, sessions.length)}
        {tabButton("materials", t("mc_materials", "Materials"), <FiFileText className="h-4 w-4" />, materials.length)}
      </div>

      <div className="p-5">
        {tab === "days" && <CourseSchedule mode="student" sessions={sessions} attendance={attendance} />}

        {tab === "attendance" && (
          marked.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mc_no_attendance", "No attendance has been taken yet.")}</p>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {marked.map((s) => {
                const present = attendance[s.id] === "PRESENT";
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${present ? "bg-emerald-500" : "bg-red-500"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{formatDay(s.date, i18n.language)}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.topic || t("no_topic", "No topic yet")}</p>
                    </div>
                    <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${present ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {present ? t("sch_present", "Present") : t("sch_absent", "Absent")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === "materials" && (
          materials.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mc_no_materials", "No material has been added yet.")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => (
                <li key={m.id}>
                  <a href={m.url || m.file || "#"} target="_blank" rel="noopener noreferrer" className="flex h-full items-start gap-3 rounded-xl border border-border p-3 text-sm transition hover:border-primary hover:bg-primary/5">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">{m.url ? <FiLink className="h-4 w-4" /> : <FiFileText className="h-4 w-4" />}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{m.title}</span>
                      {m.description && <span className="block truncate text-xs text-muted-foreground">{m.description}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="mt-4 text-right">
          <Link to="/dashboard/attendance" className="text-sm font-medium text-primary hover:underline">{t("mc_full_attendance", "See day-by-day attendance")} →</Link>
        </div>
      </div>
    </Card>
  );
};

const MyCoursesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"active" | "completed">("active");

  useEffect(() => {
    api.getMyCourseAttendance().then((records: any[]) => {
      const id = (r: any) => r.session?.id ?? r.session;
      setAttendance(Object.fromEntries(records.map((r) => [id(r), r.status])));
    }).catch(() => undefined);
    Promise.all([
      api.getMyEnrolledCourses().catch(() => []),
      api.getMyCourseAttendanceSummary().catch(() => []),
    ]).then(([courses, summary]) => {
      setRows(courses as CourseRow[]);
      setSummaries(Object.fromEntries((summary as Summary[]).map((s) => [s.semester_course, s])));
    }).finally(() => setLoading(false));
  }, []);

  const active = rows.filter((r) => r.status !== "COMPLETED");
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const shown = view === "active" ? active : completed;

  if (loading) return <div className="grid gap-4"><div className="skeleton h-56 rounded-2xl" /><div className="skeleton h-56 rounded-2xl" /></div>;

  const pill = (key: "active" | "completed", label: string, n: number) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${view === key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {label} <span className="opacity-70">({n})</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("mc_title", "My courses")}
        description={t("mc_desc", "The courses made for your year appear here once your coordinator starts them, with your attendance, the class days and the materials.")}
        icon={<FiBookOpen className="h-6 w-6" />}
      />
      {hasRole(user, "Course_coordinator") && (
        <p className="rounded-xl bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          {t("mc_coord_note", "This page shows the courses you study. The courses you coordinate are under")}{" "}
          <Link to="/dashboard/courses/coordinator" className="font-medium text-primary hover:underline">{t("mc_coord_link", "Course Coordinator")}</Link>.
        </p>
      )}
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FiBookOpen className="h-10 w-10" />}
            title={t("mc_empty_title", "No course yet")}
            description={t("mc_empty", "When your course coordinator starts a course for your year, it appears here. Make sure your year is set in your profile.")}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {pill("active", t("mc_active", "Active"), active.length)}
            {pill("completed", t("mc_completed", "Completed"), completed.length)}
          </div>
          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FiBookOpen className="h-10 w-10" />}
                title={view === "active" ? t("mc_none_active", "No active course right now") : t("mc_none_completed", "No completed course yet")}
                description={view === "active" ? t("mc_none_active_d", "Check the Completed tab for your finished courses.") : t("mc_none_completed_d", "Finished courses keep their materials and your attendance here.")}
              />
            </Card>
          ) : (
            <div className="space-y-5">
              {shown.map((row) => <CourseCard key={row.id} row={row} summary={summaries[row.id]} attendance={attendance} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyCoursesPage;
