import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { AcademicYearData } from "../types";
import { Chip, Loading, Modal, PageHeader } from "./AdminUi";

const Stat = ({ label, value, tone = "text-primary", hint }: { label: string; value: number; tone?: string; hint?: string }) => (
  <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
    <p className={`text-3xl font-bold ${tone}`}>{value}</p>
    <p className="mt-0.5 text-sm text-foreground">{label}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const AcademicYearPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [data, setData] = useState<AcademicYearData | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.academicYear());
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <Loading />;
  const p = data.preview;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString();

  const start = async () => {
    setBusy(true);
    try {
      await adminApi.startNewYear(label.trim(), force);
      toast.success(t("ay_started", "New year started."));
      setConfirming(false);
      setForce(false);
      setLabel("");
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id: number) => {
    if (!(await confirm(t("ay_confirm_undo", "Undo this run? Students go back to where they were, unless you edited them since.")))) return;
    try {
      const r = await adminApi.undoYear(id);
      toast.success(t("ay_undo_done", "Undone: {{n}} restored, {{skipped}} skipped (edited since).", { n: r.restored, skipped: r.skipped }));
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t("ay_title", "Academic year")}
        description={t("ay_desc", "Once a year, move every student up one year. Students finishing the last year of their program become graduates. Roles, groups and history stay.")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("ay_promote", "Moving up")} value={p.promote} />
        <Stat label={t("ay_graduate", "Graduating")} value={p.graduate} tone="text-emerald-600" />
        <Stat label={t("ay_unknown_year", "No year on record")} value={p.unknown_year} tone={p.unknown_year ? "text-amber-600" : "text-primary"} hint={p.unknown_year ? t("ay_unknown_year_hint", "These students are skipped. Set their year in Users & roles.") : undefined} />
        <Stat label={t("ay_unknown_dept", "Department not in the list")} value={p.unknown_department} tone={p.unknown_department ? "text-amber-600" : "text-primary"} hint={p.unknown_department ? t("ay_unknown_dept_hint", "Counted as a {{n}}-year program. Add the department to fix it.", { n: p.default_years }) : undefined} />
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold text-foreground">{t("ay_by_year", "What happens to each year")}</h2>
        {p.by_year.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ay_nothing", "Nobody to move.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {p.by_year.map((row) => (
              <li key={row.year} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="w-24 font-medium text-foreground">{t("ay_year_n", "Year {{n}}", { n: row.year })}</span>
                <span className="w-28 text-muted-foreground">{t("ay_students_n", "{{n}} student(s)", { n: row.count })}</span>
                {row.count - row.graduating > 0 && <Chip tone="primary">{t("ay_becomes", "{{n}} become year {{y}}", { n: row.count - row.graduating, y: row.year + 1 })}</Chip>}
                {row.graduating > 0 && <Chip tone="green">{t("ay_graduates_n", "{{n}} graduate", { n: row.graduating })}</Chip>}
              </li>
            ))}
          </ul>
        )}
        {p.graduating_by_department.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold text-foreground">{t("ay_grad_by_dept", "Graduating by department")}</h3>
            <div className="flex flex-wrap gap-2">
              {p.graduating_by_department.map((g) => <Chip key={g.department}>{g.department}: {g.count}</Chip>)}
            </div>
          </div>
        )}
        {p.graduating_with_roles.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{t("ay_roles_keep", "These people graduate and keep their roles")}</h3>
            <p className="text-sm text-muted-foreground">{p.graduating_with_roles.map((r) => r.name).join(", ")}</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold text-foreground">{t("ay_start_title", "Start new year")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("ay_order_hint", "Run this before the new first-year students register.")}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium">{t("ay_label", "Name of the new year (optional)")}
            <input className="input mt-1 w-64" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder={t("ay_label_ph", "For example 2026/27")} />
          </label>
          <button className="btn-primary" disabled={p.promote + p.graduate === 0} onClick={() => setConfirming(true)}>{t("ay_start_btn", "Start new year")}</button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold text-foreground">{t("ay_history", "Earlier runs")}</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ay_no_history", "No year has been started yet.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{r.label || fmt(r.performed_at)} {r.performed_by && <span className="font-normal text-muted-foreground">· {r.performed_by}</span>}</p>
                  <p className="text-xs text-muted-foreground">{fmt(r.performed_at)} · {t("ay_run_summary", "{{up}} moved up · {{grad}} graduated · {{skip}} skipped", { up: r.promoted, grad: r.graduated, skip: r.skipped })}</p>
                </div>
                {r.undone_at ? <Chip>{t("ay_undone", "Undone")}</Chip> : r.can_undo && <button className="btn-outline px-3 py-1.5 text-xs" onClick={() => undo(r.id)}>{t("ay_undo", "Undo")}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirming && (
        <Modal
          title={t("ay_confirm_title", "Start the new year?")}
          onClose={() => { setConfirming(false); setForce(false); }}
          footer={<>
            <button className="btn-outline" onClick={() => { setConfirming(false); setForce(false); }}>{t("cancel", "Cancel")}</button>
            <button className="btn-primary" disabled={busy || (p.too_soon && !force)} onClick={start}>{busy ? t("adm_working", "Working...") : t("ay_start_btn", "Start new year")}</button>
          </>}
        >
          <p className="text-sm text-foreground">{t("ay_confirm_text", "{{up}} student(s) move up one year and {{grad}} graduate. You can undo this afterwards.", { up: p.promote, grad: p.graduate })}</p>
          {p.too_soon && p.last_run_at && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <p>{t("ay_too_soon", "A new year was already started on {{date}}. Running it again moves students up twice.", { date: fmt(p.last_run_at) })}</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                {t("ay_force", "I understand, run it again")}
              </label>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default AcademicYearPage;
