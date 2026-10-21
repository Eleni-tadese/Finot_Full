// Charts (Step 6) and simple predictions (Step 7). Data comes from /api/attendance/insights/ (backend
// attendance/insights.py). Three panels share the same pieces:
//   EventInsightsPanel  - organizer pages (Events > Attendance) and the Super Admin overview
//   CourseInsightsPanel - the course attendance report
//   MyAttendanceChart   - the student's Attendance page
// Chart rules: one hue for "present" (blue), a quiet gray for "absent", thin bars with a 2px gap, one axis per
// chart, a legend for two series, a tooltip on hover, text in the page's own colours.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FiAlertTriangle, FiTrendingUp } from "react-icons/fi";

import { Card } from "../../../components/ui/Card";
import { etDate } from "../../../lib/ethiopiaTime";
import { attendanceApi, type InsightRow, type Insights, type MyInsights } from "../api";

const PRESENT = "#2a78d6"; // series blue (validated palette slot 1)
const ABSENT = "#c3c7d1"; // de-emphasis gray
const INK = "#64748b"; // muted text colour of the site
const GRID = "#e5eaf3";

const shortDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return etDate(d.toISOString()).replace(/,? \d{4}$/, ""); // "12 Oct"
};

function CountsChart({ rows }: { rows: InsightRow[] }) {
  const { t } = useTranslation();
  const data = rows.map((r) => ({ name: shortDate(String(r.date)), present: r.present, absent: r.absent, title: r.title }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(42,120,214,0.06)" }}
          contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }}
          labelFormatter={(_, payload) => (payload && payload[0] ? `${payload[0].payload.title} · ${payload[0].payload.name}` : "")}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: INK }} iconType="circle" iconSize={8} />
        <Bar dataKey="present" name={t("ins_present", "Present")} stackId="a" fill={PRESENT} stroke="#ffffff" strokeWidth={2} />
        <Bar dataKey="absent" name={t("ins_absent", "Absent")} stackId="a" fill={ABSENT} stroke="#ffffff" strokeWidth={2} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RateChart({ rows }: { rows: InsightRow[] }) {
  const { t } = useTranslation();
  const data = rows.map((r) => ({ name: shortDate(String(r.date)), rate: r.rate, title: r.title }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }}
          formatter={(v) => [`${v}%`, t("ins_rate", "Attendance rate")]}
          labelFormatter={(_, payload) => (payload && payload[0] ? `${payload[0].payload.title} · ${payload[0].payload.name}` : "")}
        />
        <Line type="monotone" dataKey="rate" stroke={PRESENT} strokeWidth={2} dot={{ r: 4, fill: PRESENT, stroke: "#ffffff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Prediction({ data, course }: { data: Insights; course: boolean }) {
  const { t } = useTranslation();
  const n = data.last_n;
  const nxt = data.next;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><FiTrendingUp className="h-4 w-4 text-primary" /> {t("ins_next_title", "What to expect next")}</p>
        {!nxt ? (
          <p className="mt-2 text-sm text-muted-foreground">{course ? t("ins_no_next_day", "No planned class day without attendance.") : t("ins_no_next", "No upcoming event.")}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-foreground">{course ? t("ins_next_day", "Next class day: {{date}}", { date: etDate(String(nxt.date).length === 10 ? `${nxt.date}T00:00:00Z` : String(nxt.date)) }) : t("ins_next_event", "Next: {{title}}, {{date}}", { title: nxt.title, date: etDate(String(nxt.date)) })}</p>
            {nxt.expected_present === null || nxt.expected_rate === null ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("ins_no_estimate", "No estimate yet: take attendance a few times first.")}</p>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold text-foreground">{t("ins_expected", "about {{n}} of {{m}}", { n: nxt.expected_present, m: nxt.roster })} <span className="text-base font-medium text-muted-foreground">({nxt.expected_rate}%)</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{course ? t("ins_expected_hint_course", "The average of the last {{n}} class days with attendance, applied to the enrolled students.", { n: nxt.based_on }) : t("ins_expected_hint", "The average of the last {{n}} events with attendance, applied to this event's list.", { n: nxt.based_on })}</p>
              </>
            )}
          </>
        )}
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><FiAlertTriangle className="h-4 w-4 text-amber-600" /> {t("ins_at_risk", "Missed the last {{n}}", { n })}</p>
        <p className="mt-1 text-xs text-muted-foreground">{course ? t("ins_at_risk_desc_course", "Enrolled but not present at any of the last {{n}} class days with attendance.", { n }) : t("ins_at_risk_desc", "On the list but not present at any of the last {{n}} events with attendance.", { n })}</p>
        {data.at_risk_total === 0 ? (
          <p className="mt-2 text-sm text-success">{t("ins_at_risk_none", "Nobody. Everyone came at least once.")}</p>
        ) : (
          <>
            <p className="mt-2 text-2xl font-bold text-foreground">{data.at_risk_total}</p>
            <ul className="mt-1 max-h-32 overflow-y-auto text-sm text-foreground">
              {data.at_risk.slice(0, 30).map((p) => (
                <li key={p.id} className="truncate">{p.name}{p.batch_year ? <span className="text-muted-foreground"> · {t("evatt_year", "Year {{n}}", { n: p.batch_year })}</span> : null}</li>
              ))}
              {data.at_risk_total > 30 && <li className="text-muted-foreground">{t("ins_at_risk_more", "and {{n}} more", { n: data.at_risk_total - 30 })}</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function InsightsBody({ data, course }: { data: Insights; course: boolean }) {
  const { t } = useTranslation();
  const counted = data.events.filter((r) => r.counted);
  return (
    <div className="space-y-5">
      {counted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("ins_no_data", "No attendance taken yet. The charts appear after the first one.")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">{course ? t("ins_counts_course", "Present and absent per class day") : t("ins_counts", "Present and absent per event")}</p>
            <CountsChart rows={counted} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">{t("ins_rate", "Attendance rate")}{data.average_rate !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("ins_average", "average of the last {{n}}: {{p}}%", { n: Math.min(data.last_n, counted.length), p: data.average_rate })}</span>}</p>
            <RateChart rows={counted} />
          </div>
        </div>
      )}
      <Prediction data={data} course={course} />
    </div>
  );
}

function useInsights(load: () => Promise<Insights>, deps: unknown[]) {
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    load().then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, failed };
}

function Frame({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!compact);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{t("ins_title", "Attendance insights")}</h3>
        {compact && <button type="button" onClick={() => setOpen((v) => !v)} className="btn-outline px-3 py-1 text-xs">{open ? t("ins_hide", "Hide") : t("ins_show", "Show")}</button>}
      </div>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

const Spinner = () => <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>;

/** Organizer pages and the Super Admin overview. */
export function EventInsightsPanel({ scope, groupId, compact }: { scope: "all" | "mine" | "group"; groupId?: number; compact?: boolean }) {
  const { t } = useTranslation();
  const { data, failed } = useInsights(() => attendanceApi.eventInsights(scope, groupId), [scope, groupId]);
  return (
    <Frame compact={compact}>
      {failed ? <p className="py-6 text-center text-sm text-muted-foreground">{t("adm_load_failed", "Could not load this page. Please try again.")}</p> : !data ? <Spinner /> : <InsightsBody data={data} course={false} />}
    </Frame>
  );
}

/** The course attendance report. */
export function CourseInsightsPanel({ semesterCourseId }: { semesterCourseId: string }) {
  const { t } = useTranslation();
  const { data, failed } = useInsights(() => attendanceApi.courseInsights(semesterCourseId), [semesterCourseId]);
  return (
    <Frame>
      {failed ? <p className="py-6 text-center text-sm text-muted-foreground">{t("adm_load_failed", "Could not load this page. Please try again.")}</p> : !data ? <Spinner /> : <InsightsBody data={data} course />}
    </Frame>
  );
}

/** The student's own months: events and classes, present over absent, plus the streak. */
export function MyAttendanceChart() {
  const { t } = useTranslation();
  const [data, setData] = useState<MyInsights | null>(null);
  useEffect(() => {
    attendanceApi.myInsights().then(setData).catch(() => setData({ months: [], streak: 0 }));
  }, []);
  if (!data) return null;
  const rows = data.months.map((m) => ({
    name: new Date(`${m.month}-01T00:00:00Z`).toLocaleString(undefined, { month: "short" }),
    present: m.events_present + m.classes_present,
    absent: m.events_absent + m.classes_absent,
  }));
  const any = rows.some((r) => r.present + r.absent > 0);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium text-foreground">{t("ins_my_months", "Your last 6 months")}</h3>
        {data.streak > 1 && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">{t("ins_streak", "Present at the last {{n}} events in a row", { n: data.streak })}</span>}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{t("ins_my_months_hint", "Events and class days together.")}</p>
      {!any ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("ins_no_data_me", "Nothing recorded in the last 6 months.")}</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="name" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} contentStyle={{ borderRadius: 10, border: `1px solid ${GRID}`, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: INK }} iconType="circle" iconSize={8} />
            <Bar dataKey="present" name={t("ins_present", "Present")} stackId="a" fill={PRESENT} stroke="#ffffff" strokeWidth={2} />
            <Bar dataKey="absent" name={t("ins_absent", "Absent")} stackId="a" fill={ABSENT} stroke="#ffffff" strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
