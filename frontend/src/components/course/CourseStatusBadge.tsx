import { useTranslation } from "react-i18next";

export type CourseStatus = "PLANNED" | "OPEN" | "COMPLETED";

const STYLE: Record<CourseStatus, string> = {
  PLANNED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  OPEN: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  COMPLETED: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

const DOT: Record<CourseStatus, string> = {
  PLANNED: "bg-amber-500",
  OPEN: "bg-emerald-500",
  COMPLETED: "bg-slate-500",
};

/** Not started / Open / Completed, the same small pill everywhere a course is shown. */
const CourseStatusBadge = ({ status }: { status?: string }) => {
  const { t } = useTranslation();
  const s = (status as CourseStatus) in STYLE ? (status as CourseStatus) : "PLANNED";
  const label = {
    PLANNED: t("crs_status_planned", "Not started"),
    OPEN: t("crs_status_open", "Open"),
    COMPLETED: t("crs_status_completed", "Completed"),
  }[s];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[s]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[s]}`} />
      {label}
    </span>
  );
};

export default CourseStatusBadge;
