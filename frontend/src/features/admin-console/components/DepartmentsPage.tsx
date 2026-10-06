import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { Department } from "../types";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";

const YEARS = [3, 4, 5, 6, 7];

const DepartmentsPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [form, setForm] = useState({ name: "", years: 5 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await adminApi.departments());
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const fail = (e: any) => toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));

  const open = (d: Department | "new") => {
    setForm(d === "new" ? { name: "", years: 5 } : { name: d.name, years: d.years });
    setEditing(d);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error(t("dep_name_required", "Give the department a name.")); return; }
    setSaving(true);
    try {
      if (editing === "new") await adminApi.createDepartment(form.name.trim(), form.years);
      else if (editing) await adminApi.updateDepartment(editing.id, { name: form.name.trim(), years: form.years });
      toast.success(t("adm_saved", "Saved."));
      setEditing(null);
      await load();
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const toggle = async (d: Department) => {
    try { await adminApi.updateDepartment(d.id, { is_active: !d.is_active }); await load(); } catch (e) { fail(e); }
  };

  const remove = async (d: Department) => {
    if (!(await confirm(t("dep_confirm_delete", "Delete the department \"{{name}}\"?", { name: d.name })))) return;
    try { await adminApi.deleteDepartment(d.id); toast.success(t("adm_deleted", "Deleted.")); await load(); } catch (e) { fail(e); }
  };

  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("dep_title", "Departments")}
        description={t("dep_desc", "The departments students choose from, and how many years each program lasts. The yearly rollover uses the length to know when a student graduates.")}
        actions={<button className="btn-primary" onClick={() => open("new")}>{t("dep_add", "Add department")}</button>}
      />

      {items.length === 0 ? (
        <Empty>{t("dep_empty", "No departments yet. Add the first one. Until you do, students type their department by hand and every program counts as 5 years.")}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((d) => (
            <div key={d.id} className={`card ${d.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{d.name}</h3>
                <Chip tone="primary">{t("dep_years_n", "{{n}} years", { n: d.years })}</Chip>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t("dep_students_n", "{{n}} student(s)", { n: d.student_count })}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <button className="text-primary hover:underline" onClick={() => open(d)}>{t("edit", "Edit")}</button>
                <button className="text-primary hover:underline" onClick={() => toggle(d)}>{d.is_active ? t("dep_hide", "Hide") : t("dep_show", "Show")}</button>
                <button
                  className="text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={d.student_count > 0}
                  title={d.student_count > 0 ? t("dep_delete_blocked", "Students use this department. Hide it instead.") : undefined}
                  onClick={() => remove(d)}
                >{t("delete", "Delete")}</button>
                {!d.is_active && <Chip>{t("dep_hidden", "Hidden")}</Chip>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? t("dep_add", "Add department") : t("dep_edit", "Edit department")}
          onClose={() => setEditing(null)}
          footer={<>
            <button className="btn-outline" onClick={() => setEditing(null)}>{t("cancel", "Cancel")}</button>
            <button className="btn-primary" disabled={saving} onClick={save}>{saving ? t("adm_working", "Working...") : t("save", "Save")}</button>
          </>}
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium">{t("dep_name", "Department name")}
              <input className="input mt-1 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">{t("dep_years", "Program length (years)")}
              <select className="input mt-1 w-full" value={form.years} onChange={(e) => setForm({ ...form, years: Number(e.target.value) })}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            {editing !== "new" && <p className="text-xs text-muted-foreground">{t("dep_rename_hint", "Renaming also renames it for every student who has it.")}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DepartmentsPage;
