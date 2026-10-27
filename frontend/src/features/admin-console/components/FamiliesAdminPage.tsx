import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import ExportButton from "../../export/components/ExportButton";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { DistributionOverview, DistributionPreview, FamilyRow } from "../types";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";
import UserPicker, { PickedUser } from "./UserPicker";

const FamiliesAdminPage = () => {
  const { t } = useTranslation();
  const askConfirm = useConfirm();
  const [data, setData] = useState<DistributionOverview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [gender, setGender] = useState("");
  const [block, setBlock] = useState("");
  const [section, setSection] = useState("");
  const [preview, setPreview] = useState<DistributionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [famName, setFamName] = useState("");
  const [famFather, setFamFather] = useState<PickedUser | null>(null);
  const [famMother, setFamMother] = useState<PickedUser | null>(null);
  const [famReligious, setFamReligious] = useState("");
  const [rows, setRows] = useState<FamilyRow[]>([]);
  const [editing, setEditing] = useState<FamilyRow | null>(null);
  const [editFather, setEditFather] = useState<PickedUser | null>(null);
  const [editMother, setEditMother] = useState<PickedUser | null>(null);
  const [editReligious, setEditReligious] = useState("");
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await adminApi.distribution();
      setData(d);
      setRows(await adminApi.families());
      setSelected(d.families.filter((f) => f.member_count < d.limit).map((f) => f.id));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <Loading />;

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const runPreview = async () => {
    setBusy(true);
    try {
      setPreview(await adminApi.previewDistribution({ family_ids: selected, gender, dorm_block: block, section }));
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const runAuto = async () => {
    setBusy(true);
    try {
      setPreview(await adminApi.autoPreviewDistribution());
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await adminApi.confirmDistribution(preview.pairs, preview.new_families);
      toast.success(t("adm_assigned_n", "Assigned {{n}} student(s). You can undo this below.", { n: res.applied }));
      res.skipped.slice(0, 3).forEach((s) => toast.error(s));
      setPreview(null);
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const createFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!famName.trim()) { toast.error(t("fam_name_required", "Give the family a name.")); return; }
    setBusy(true);
    try {
      await adminApi.createFamily({
        name: famName, father_id: famFather?.id ?? null, mother_id: famMother?.id ?? null, religious_father: famReligious,
      });
      toast.success(t("fam_created", "Family created."));
      setCreating(false);
      setFamName(""); setFamFather(null); setFamMother(null); setFamReligious("");
      await load();
    } catch (err: any) {
      toast.error(firstApiError(err?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (f: FamilyRow) => {
    setEditing(f);
    setEditFather(f.father);
    setEditMother(f.mother);
    setEditReligious(f.religious_father);
    setEditName(f.name);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await adminApi.updateFamily(editing.id, { name: editName, father_id: editFather?.id ?? null, mother_id: editMother?.id ?? null, religious_father: editReligious });
      toast.success(t("fam_saved", "Family saved."));
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(firstApiError(err?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const removeFamily = async () => {
    if (!editing) return;
    if (!(await askConfirm(t("fam_delete_confirm", "Delete {{name}}? Its {{n}} student(s) will be left without a family (you can place them again). The father and mother are freed.", { name: editing.name, n: editing.member_count })))) return;
    setBusy(true);
    try {
      await adminApi.deleteFamily(editing.id);
      toast.success(t("fam_deleted", "Family deleted."));
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(firstApiError(err?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id: number) => {
    if (!(await askConfirm(t("adm_confirm_undo", "Remove these students from their families?")))) return;
    try {
      const res = await adminApi.undoDistribution(id);
      toast.success(t("adm_undone_n", "Undone: {{n}} student(s) removed.", { n: res.removed }));
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title={t("adm_fam_title", "Family distribution")}
        description={t("adm_fam_desc", "Puts unassigned first-year students into families automatically. Sizes stay even (maximum {{n}}), each family gets a mix of sections and dorm blocks, and every family has men and women. You see a preview first; nothing is saved until you confirm.", { n: data.limit })}
        actions={
          <>
            <button onClick={() => setCreating(true)} className="btn-primary px-4 py-2 text-sm">{t("fam_new", "New family")}</button>
            <ExportButton path="families/" />
          </>
        }
      />

      {!preview ? (
        <Card>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("adm_unassigned_n", "{{n}} first-year student(s) are not in a family.", { n: data.unassigned_count })}
          </p>

          {data.unassigned_count > 0 && data.families.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <span className="flex-1">{t("fam_late_banner", "{{n}} first-year student(s) have no family yet (for example late registrations). The button below places them: families with room first, new families only if needed.", { n: data.unassigned_count })}</span>
              <button onClick={runAuto} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{t("fam_place_late", "Place them now")}</button>
            </div>
          )}
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t("adm_auto_title", "Let the system make the families")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("adm_auto_desc", "It first fills mixed families that already have room, then creates as many new families as needed (at most {{n}} students each, women and men mixed, spread by dorm block and section). Add the father and mother afterwards. You see a preview first; nothing is saved until you confirm.", { n: data.limit })}
            </p>
            <button onClick={runAuto} disabled={busy || data.unassigned_count === 0} className="btn-primary mt-3 px-4 py-2 text-sm">
              {busy ? t("adm_working", "Working...") : t("adm_auto_btn", "Create families automatically and preview")}
            </button>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-foreground">{t("adm_students_filter", "Which students (optional filters)")}</h2>
          <div className="mb-5 flex flex-wrap gap-3">
            <select className="input w-40" value={gender} onChange={(e) => setGender(e.target.value)} aria-label={t("adm_gender")}>
              <option value="">{t("adm_any_gender", "Any gender")}</option>
              <option value="M">{t("male", "Male")}</option>
              <option value="F">{t("female", "Female")}</option>
            </select>
            <select className="input w-40" value={block} onChange={(e) => setBlock(e.target.value)} aria-label={t("adm_dorm_block")}>
              <option value="">{t("adm_any_block", "Any dorm block")}</option>
              {data.filter_options.dorm_blocks.map((b) => <option key={b} value={b}>{t("adm_block_n", { n: b })}</option>)}
            </select>
            <select className="input w-40" value={section} onChange={(e) => setSection(e.target.value)} aria-label={t("adm_section")}>
              <option value="">{t("adm_any_section", "Any section")}</option>
              {data.filter_options.sections.map((s) => <option key={s} value={s}>{t("adm_section_n", { n: s })}</option>)}
            </select>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-foreground">{t("adm_families_to_fill", "Families to fill")}</h2>
          {data.families.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adm_no_families", "No families exist yet. Create them in the Django admin first.")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.families.map((f) => {
                const full = f.member_count >= data.limit;
                return (
                  <label key={f.id} className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 ${full ? "opacity-50" : "cursor-pointer"}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={full} checked={selected.includes(f.id)} onChange={() => toggle(f.id)} />
                    <span className="flex-1 truncate text-sm text-foreground">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{f.member_count}/{data.limit}</span>
                  </label>
                );
              })}
            </div>
          )}

          <button onClick={runPreview} disabled={busy || selected.length === 0} className="btn-primary mt-5 px-4 py-2 text-sm">
            {busy ? t("adm_working", "Working...") : t("adm_preview", "Preview distribution")}
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="text-sm text-foreground">
              {t("adm_preview_summary", "{{n}} student(s) would be added. Nothing has been saved yet.", { n: preview.total_added })}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={confirm} disabled={busy || preview.total_added === 0} className="btn-primary px-4 py-2 text-sm">
                {busy ? t("adm_working", "Working...") : t("adm_confirm_n", "Confirm and assign {{n}}", { n: preview.total_added })}
              </button>
              <button onClick={() => setPreview(null)} disabled={busy} className="btn-outline px-4 py-2 text-sm">{t("adm_back", "Back")}</button>
            </div>
          </Card>

          {preview.unplaced.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 font-medium">{t("adm_unplaced_n", "{{n}} student(s) could not be placed", { n: preview.unplaced.length })}</p>
              <ul className="list-disc pl-5">{preview.unplaced.map((u) => <li key={u.id}>{u.name} - {u.reason}</li>)}</ul>
            </div>
          )}

          {preview.rows.map((row) => (
            <Card key={row.family_id}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="font-medium text-foreground">{row.family_name}</span>
                {row.is_new && <Chip>{t("adm_new_family", "new family")}</Chip>}
                {row.female !== undefined && row.male !== undefined && (
                  <span className="text-xs text-muted-foreground">{t("adm_gender_mix", "{{f}} women, {{m}} men", { f: row.female, m: row.male })}</span>
                )}
                <span className="text-xs text-muted-foreground">{row.current} → {row.after} (+{row.added.length})</span>
              </div>
              {row.added.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("adm_no_new", "No new students.")}</p>
              ) : (
                <ul className="grid gap-x-6 gap-y-1 text-sm text-foreground sm:grid-cols-2">
                  {row.added.map((s) => (
                    <li key={s.id}>{s.name} <span className="text-xs text-muted-foreground">{s.dorm_block ? t("adm_block_n", { n: s.dorm_block }) : ""}{s.section ? ` · ${t("adm_sec_n", { n: s.section })}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <Modal title={t("fam_new", "New family")} onClose={() => setCreating(false)}>
          <form onSubmit={createFamily} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="fam-name">{t("fam_name", "Family name")} *</label>
              <input id="fam-name" className="input mt-1 w-full" value={famName} onChange={(e) => setFamName(e.target.value)} maxLength={100} />
            </div>
            <UserPicker label={t("fam_father", "Father (a man, optional)")} value={famFather} onChange={setFamFather} limited />
            <UserPicker label={t("fam_mother", "Mother (a woman, optional)")} value={famMother} onChange={setFamMother} limited />
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="fam-rel">{t("fam_religious", "Religious father (optional)")}</label>
              <input id="fam-rel" className="input mt-1 w-full" value={famReligious} onChange={(e) => setFamReligious(e.target.value)} maxLength={150} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
              <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">{busy ? t("saving") : t("fam_create", "Create family")}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={t("fam_edit", "{{name}}: father and mother", { name: editing.name })} onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="fam-name2">{t("fam_name", "Family name")}</label>
              <input id="fam-name2" className="input mt-1 w-full" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
            </div>
            <UserPicker label={t("fam_father", "Father (a man, optional)")} value={editFather} onChange={setEditFather} limited />
            <UserPicker label={t("fam_mother", "Mother (a woman, optional)")} value={editMother} onChange={setEditMother} limited />
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="fam-rel2">{t("fam_religious", "Religious father (optional)")}</label>
              <input id="fam-rel2" className="input mt-1 w-full" value={editReligious} onChange={(e) => setEditReligious(e.target.value)} maxLength={150} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={removeFamily} disabled={busy} className="btn-outline px-3 py-2 text-sm text-destructive">{t("fam_delete", "Delete family")}</button>
              <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
              <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">{busy ? t("saving") : t("save", "Save")}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold text-foreground">{t("fam_all", "All families")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("fam_all_hint", "Every family should have a father and a mother. They are saved on the family, and students see them under Family. Families without both come first.")}</p>
        {rows.length === 0 ? (
          <Empty>{t("fam_none", "No families yet.")}</Empty>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {rows.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-medium text-foreground">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{f.member_count}/{data.limit}</span>
                  <span className="text-muted-foreground">
                    {f.father ? f.father.full_name : <em className="text-amber-700">{t("fam_no_father", "no father")}</em>}
                    {" · "}
                    {f.mother ? f.mother.full_name : <em className="text-amber-700">{t("fam_no_mother", "no mother")}</em>}
                  </span>
                  <button onClick={() => openEdit(f)} className="btn-outline ml-auto px-3 py-1 text-xs">{t("fam_set_parents", "Father and mother")}</button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("adm_recent_dist", "Recent distributions")}</h2>
        {data.batches.length === 0 ? (
          <Empty>{t("adm_no_dist", "No distributions yet.")}</Empty>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {data.batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-foreground">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="text-muted-foreground">{b.created_by ?? "-"} · {b.student_count} {t("adm_students_word", "student(s)")}</span>
                  <span className="ml-auto">
                    {b.undone_at ? <Chip>{t("adm_undone", "undone")}</Chip> : <button onClick={() => undo(b.id)} className="btn-outline px-3 py-1 text-xs text-destructive">{t("adm_undo", "Undo")}</button>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
};

export default FamiliesAdminPage;
