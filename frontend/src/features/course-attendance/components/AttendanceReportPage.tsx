import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Spinner from "../../../components/ui/Spinner";
import CourseStatusBadge from "../../../components/course/CourseStatusBadge";
import { useAttendanceReport } from "../hooks/useAttendanceReport";
import { percentageColor } from "../utils";
import { formatDay } from "../../../lib/dates";
import ExportButton from "../../export/components/ExportButton";
import { CourseInsightsPanel } from "../../attendance/components/AttendanceInsights";

type View = "summary" | "days";

const AttendanceReportPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { report, loading, error } = useAttendanceReport(id);
  const [view, setView] = useState<View>("summary");
  const [search, setSearch] = useState("");
  const [lowestFirst, setLowestFirst] = useState(false);

  const students = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    const rows = report.students.filter((s) =>
      !q || [s.first_name, s.middle_name, s.last_name, s.username].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
    return lowestFirst ? [...rows].sort((a, b) => a.percentage - b.percentage) : rows;
  }, [report, search, lowestFirst]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="h-8 w-8" />
      </div>
    );
  }

  if (error || !report) {
    return <p className="text-center py-12 text-muted-foreground">{t("failed_to_load_report")}</p>;
  }

  const name = (s: { first_name: string; middle_name?: string; last_name: string; username: string }) =>
    [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ") || s.username;
  const markedDays = report.sessions.filter((d) => d.marked);
  const semester = report.semester === 1 ? t("crs_sem_1", "First semester") : t("crs_sem_2", "Second semester");

  const tab = (key: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <button
        onClick={() => navigate("/dashboard/courses/coordinator")}
        className="text-sm text-primary hover:text-primary-light"
      >
        ← {t("back_to_courses")}
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("attendance_report")}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{report.course_title}</span>
            <span>· {t("flt_batch_n", "Batch {{n}}", { n: report.batch_year })} · {report.academic_year} · {semester}</span>
            <CourseStatusBadge status={report.status} />
          </p>
        </div>
        <ExportButton path={`course-attendance/${report.semester_course}/`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-foreground">{report.sessions_held} / {report.sessions_total}</p>
          <p className="text-xs text-muted-foreground">{t("sessions_held")}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-foreground">{report.student_count}</p>
          <p className="text-xs text-muted-foreground">{t("enrolled_students")}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-foreground">{report.average_percentage}%</p>
          <p className="text-xs text-muted-foreground">{t("average_attendance")}</p>
        </div>
      </div>

      <CourseInsightsPanel semesterCourseId={report.semester_course} />

      {report.students.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">{t("no_report_data")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {tab("summary", t("rep_summary", "Summary"))}
            {tab("days", t("rep_by_day", "By class day"))}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("rep_search", "Search a student")}
              className="input ml-auto w-full sm:w-64 py-1.5 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={lowestFirst} onChange={(e) => setLowestFirst(e.target.checked)} />
              {t("rep_lowest_first", "Lowest attendance first")}
            </label>
          </div>

          {students.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t("rep_no_match", "No student matches your search.")}</p>
          ) : view === "summary" ? (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("student")}</th>
                    <th className="px-4 py-3">{t("present")}</th>
                    <th className="px-4 py-3">{t("absent")}</th>
                    <th className="px-4 py-3">{t("unmarked")}</th>
                    <th className="px-4 py-3 w-48">{t("attendance_percentage")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => (
                    <tr key={s.student_id}>
                      <td className="px-4 py-3 font-medium text-foreground">{name(s)}</td>
                      <td className="px-4 py-3">{s.present}</td>
                      <td className="px-4 py-3">{s.absent}</td>
                      <td className="px-4 py-3">{s.unmarked}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${percentageColor(s.percentage)}`} style={{ width: `${s.percentage}%` }} />
                          </div>
                          <span className="w-12 text-right">{s.percentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : markedDays.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t("mc_no_attendance", "No attendance has been taken yet.")}</p>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left">{t("student")}</th>
                    {markedDays.map((d) => (
                      <th key={d.id} className="whitespace-nowrap px-2 py-3 text-center text-xs font-medium" title={d.topic || ""}>
                        {formatDay(d.date, i18n.language)}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => (
                    <tr key={s.student_id}>
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium text-foreground">{name(s)}</td>
                      {markedDays.map((d) => {
                        const status = s.days[d.id];
                        return (
                          <td key={d.id} className="px-2 py-2 text-center">
                            {status === "PRESENT" ? (
                              <span className="inline-block w-7 rounded bg-green-100 py-0.5 text-xs font-semibold text-green-700">{t("rep_p", "P")}</span>
                            ) : status === "ABSENT" ? (
                              <span className="inline-block w-7 rounded bg-red-100 py-0.5 text-xs font-semibold text-red-700">{t("rep_a", "A")}</span>
                            ) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-medium">{s.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                {t("rep_legend", "P = present, A = absent, – = not marked. Only class days with attendance are shown.")}
                {report.sessions_total > markedDays.length && ` ${t("rep_days_left", "{{n}} planned day(s) have no attendance yet.", { n: report.sessions_total - markedDays.length })}`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceReportPage;
