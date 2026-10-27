import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import axiosInstance from "../../lib/axios";
import { firstApiError } from "../../features/resources/utils";

type Dept = { id: number; name: string; years: number; is_stage: boolean };

/**
 * First thing a slip student sees (before the name step and every other page) while the Super Admin allows the year
 * choice: pick the year of study and the department, once. The server decides (can_choose_year); a wrong choice is
 * corrected by the Super Admin in Users & roles.
 */
const YearChoiceStep = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [year, setYear] = useState(user?.profile?.batch_year ? String(user.profile.batch_year) : "");
  const [department, setDepartment] = useState(user?.profile?.department || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    axiosInstance.get("/api/student/departments/").then((r) => setDepartments(r.data)).catch(() => setDepartments([]));
  }, []);

  const years = [
    { label: t("freshman"), value: "1" }, { label: t("2nd_year"), value: "2" }, { label: t("3rd_year"), value: "3" },
    { label: t("4th_year"), value: "4" }, { label: t("5th_gc"), value: "5" },
  ];
  // In year 1 a student is on a stage (Pre-Engineering, Pre-Science...); later years pick from what lasts long enough.
  const stagesExist = departments.some((d) => d.is_stage);
  const choices = departments.filter((d) => (year === "1" ? (stagesExist ? d.is_stage : true) : d.years >= Number(year || 0)));
  const departmentOk = department === "" || choices.some((d) => d.name === department);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!year) { setError(t("yc_need_year", "Choose your year of study.")); return; }
    if (departments.length > 0 && (!department || !departmentOk)) { setError(t("yc_need_department", "Choose your department from the list.")); return; }
    setBusy(true);
    setError("");
    try {
      await api.updateProfile({ batch_year: Number(year), ...(department ? { department } : {}), year_confirmed: true });
      setUser(await api.getUser());
    } catch (err: any) {
      setError(firstApiError(err?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("yc_title", "Welcome to Finot")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("yc_intro", "First choose your year of study and your department. You can choose them only once; after that only the Super Admin can change them.")}
        </p>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground" htmlFor="yc-year">{t("batch_year")}</label>
        <select id="yc-year" className="input mt-1 w-full" value={year} onChange={(e) => { setYear(e.target.value); setDepartment(""); }}>
          <option value="">{t("prof_pick_year", "Choose your year of study")}</option>
          {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
        </select>
      </div>
      {departments.length > 0 && (
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="yc-dept">{t("yc_department", "Department")}</label>
          <select id="yc-dept" className="input mt-1 w-full" value={department} onChange={(e) => setDepartment(e.target.value)} disabled={!year}>
            <option value="">{t("yc_pick_department", "Choose your department")}</option>
            {choices.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          {year === "1" && <p className="mt-1 text-xs text-muted-foreground">{t("yc_year1_hint", "In year 1 choose a stage such as Pre-Engineering or Pre-Science. The final department comes later.")}</p>}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "…" : t("yc_continue", "Continue")}</button>
    </form>
  );
};

export default YearChoiceStep;
