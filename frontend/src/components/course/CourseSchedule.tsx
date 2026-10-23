import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCalendar } from "react-icons/fi";
import { formatDay, parseYmd, ymd } from "../../lib/dates";

export interface ScheduleSession {
  id: string;
  date: string;
  topic: string | null;
  teacher_name: string | null;
  marked_count?: number;
}

interface Props {
  sessions: ScheduleSession[];
  mode: "coordinator" | "student";
  /** Student view: this student's status for each class day, by session id. */
  attendance?: Record<string, string>;
  /** Coordinator view of a completed course: nothing can be changed. */
  readOnly?: boolean;
  onMark?: (s: ScheduleSession) => void;
  onEdit?: (s: ScheduleSession) => void;
  onDelete?: (s: ScheduleSession) => void;
  className?: string;
}

type View = "upcoming" | "past" | "all";

/** The whole plan of a course: summary, then every class day grouped by month. Same view for coordinators and students. */
const CourseSchedule = ({ sessions, mode, attendance = {}, readOnly = false, onMark, onEdit, onDelete, className = "" }: Props) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));

  const sorted = useMemo(() => [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1)), [sessions]);
  const upcoming = sorted.filter((s) => s.date >= today);
  const past = sorted.filter((s) => s.date < today);
  const [view, setView] = useState<View>(upcoming.length > 0 ? "upcoming" : "all");

  const shown = view === "upcoming" ? upcoming : view === "past" ? past : sorted;

  // "Meets on Mon, Wed": the weekdays that carry most of the class days
  const pattern = useMemo(() => {
    const counts = new Map<number, number>();
    sorted.forEach((s) => counts.set(parseYmd(s.date).getDay(), (counts.get(parseYmd(s.date).getDay()) ?? 0) + 1));
    const top = Math.max(0, ...counts.values());
    return Array.from(counts.entries())
      .filter(([, n]) => n >= top * 0.6)
      .sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7))
      .map(([day]) => new Date(2024, 0, day === 0 ? 7 : day).toLocaleDateString(lang, { weekday: "short" }))
      .join(", ");
  }, [sorted, lang]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, ScheduleSession[]>();
    shown.forEach((s) => {
      const key = s.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    });
    return Array.from(groups.entries());
  }, [shown]);

  if (sorted.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground ${className}`}>
        <FiCalendar className="mx-auto mb-2 h-8 w-8 opacity-50" />
        {t("mc_no_days", "No class day has been added yet.")}
      </div>
    );
  }

  const next = upcoming[0];
  const tab = (key: View, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {label} <span className="opacity-70">({n})</span>
    </button>
  );

  const chip = (text: string, tone: string) => <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${tone}`}>{text}</span>;

  return (
    <div className={className}>
      <div className="mb-3 rounded-xl bg-primary/5 p-3 text-sm">
        <p className="font-medium text-foreground">
          {t("sch_summary", "{{n}} class days · {{from}} to {{to}}", { n: sorted.length, from: formatDay(sorted[0].date, lang), to: formatDay(sorted[sorted.length - 1].date, lang) })}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {pattern && <>{t("sch_meets", "Usually meets on")}: <span className="font-medium text-foreground">{pattern}</span></>}
          {next && <>{pattern ? " · " : ""}{t("sch_next", "Next class")}: <span className="font-medium text-foreground">{formatDay(next.date, lang)}</span></>}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {tab("upcoming", t("sch_upcoming", "Upcoming"), upcoming.length)}
        {tab("past", t("sch_past", "Past"), past.length)}
        {tab("all", t("sch_all", "All"), sorted.length)}
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("sch_none", "No class days in this view.")}</p>
      ) : (
        <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
          {byMonth.map(([month, rows]) => (
            <section key={month}>
              <h4 className="sticky top-0 z-10 bg-card py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {parseYmd(`${month}-01`).toLocaleDateString(lang, { month: "long", year: "numeric" })}
              </h4>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {rows.map((s) => {
                  const isPast = s.date < today;
                  const status = attendance[s.id];
                  return (
                    <li key={s.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${isPast ? "opacity-80" : ""}`}>
                      <div className="w-14 shrink-0 text-center leading-tight">
                        <p className="text-xl font-bold text-primary">{parseYmd(s.date).getDate()}</p>
                        <p className="text-xs uppercase text-muted-foreground">{parseYmd(s.date).toLocaleDateString(lang, { weekday: "short" })}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{s.topic || t("no_topic", "No topic yet")}</p>
                        {s.teacher_name && <p className="truncate text-xs text-muted-foreground">{t("teacher", "Teacher")}: {s.teacher_name}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {s.date === today && chip(t("sch_today", "Today"), "bg-amber-100 text-amber-700")}
                        {s.date === tomorrow && chip(t("sch_tomorrow", "Tomorrow"), "bg-blue-100 text-blue-700")}
                        {mode === "student" && isPast && (
                          status === "PRESENT" ? chip(t("sch_present", "Present"), "bg-green-100 text-green-700")
                          : status === "ABSENT" ? chip(t("sch_absent", "Absent"), "bg-red-100 text-red-700")
                          : chip(t("sch_not_marked", "Not marked"), "bg-muted text-muted-foreground")
                        )}
                        {mode === "coordinator" && (s.marked_count ?? 0) > 0 && chip(t("cd_marked_n", "{{n}} marked", { n: s.marked_count }), "bg-green-100 text-green-700")}
                        {mode === "coordinator" && !readOnly && (
                          <>
                            <button onClick={() => onEdit?.(s)} className="text-sm text-primary hover:underline">{t("edit", "Edit")}</button>
                            <button onClick={() => onDelete?.(s)} className="text-sm text-destructive hover:underline">{t("delete", "Delete")}</button>
                            {s.date <= today && (
                              <button onClick={() => onMark?.(s)} className="btn-outline px-3 py-1.5 text-xs">{t("mark_attendance", "Mark attendance")}</button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default CourseSchedule;
