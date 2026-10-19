import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import { credentialsCsv, slipsHtml, type Credential } from "../slips";
import type { ImportBatchRow, ImportPreview } from "../types";
import { Chip, Empty, PageHeader } from "./AdminUi";
import SlipProgressPanel from "./SlipProgressPanel";

const CHUNK = 100;
type Phase = "choose" | "preview" | "running" | "paused" | "done";

const ImportStudentsPage = () => {
  const { t } = useTranslation();
  const askConfirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [graceDays, setGraceDays] = useState(21);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [rejected, setRejected] = useState<{ row: number; errors: string[] }[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false); // the slips were printed or downloaded
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [mode, setMode] = useState<"list" | "blank">("list");
  const [blankCount, setBlankCount] = useState("100");
  const [blankTotal, setBlankTotal] = useState(0);
  const next = useRef(0);
  const batchId = useRef<number | null>(null);

  const loadBatches = useCallback(async () => {
    try { setBatches(await adminApi.importBatches()); } catch { /* the list is optional */ }
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  // The passwords exist only in this page: warn before it is closed while they are not saved yet.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (creds.length > 0 && !saved) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [creds.length, saved]);

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const getTemplate = async () => {
    try { download(await adminApi.importTemplate(), "students-template.xlsx"); }
    catch { toast.error(t("export_failed")); }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await adminApi.importPreview(file);
      setPreview(data);
      setGraceDays(data.grace_days);
      setShowAll(false);
      setPhase("preview");
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const run = async (rows: ImportPreview["rows"]) => {
    setPhase("running");
    setError(null);
    try {
      while (next.current < rows.length) {
        const slice = rows.slice(next.current, next.current + CHUNK).map(({ errors, warnings, ...clean }) => clean);
        const res = await adminApi.importCommit({ batch_id: batchId.current, grace_days: graceDays, rows: slice });
        batchId.current = res.batch_id;
        setCreds((prev) => [...prev, ...res.created]);
        setRejected((prev) => [...prev, ...res.rejected]);
        next.current += slice.length;
        setProgress(next.current);
      }
      setPhase("done");
      loadBatches();
    } catch (e: any) {
      setError(firstApiError(e?.response?.data) || t("imp_failed", "The connection stopped. Nothing is lost: press Continue."));
      setPhase("paused");
    }
  };

  const start = async () => {
    if (!preview) return;
    const rows = preview.rows.filter((r) => r.errors.length === 0);
    if (!(await askConfirm(t("imp_confirm", "Register {{n}} students? Each gets a login slip valid for {{d}} days.", { n: rows.length, d: graceDays })))) return;
    next.current = 0; batchId.current = null; setCreds([]); setRejected([]); setProgress(0); setSaved(false); setMode("list");
    run(rows);
  };

  const runBlank = async (total: number) => {
    setPhase("running");
    setError(null);
    try {
      while (next.current < total) {
        const n = Math.min(CHUNK, total - next.current);
        const res = await adminApi.importBlank({ count: n, batch_id: batchId.current, grace_days: graceDays });
        batchId.current = res.batch_id;
        setCreds((prev) => [...prev, ...res.created]);
        next.current += n;
        setProgress(next.current);
      }
      setPhase("done");
      loadBatches();
    } catch (e: any) {
      setError(firstApiError(e?.response?.data) || t("imp_failed", "The connection stopped. Nothing is lost: press Continue."));
      setPhase("paused");
    }
  };

  const startBlank = async () => {
    const total = Number(blankCount);
    if (!Number.isInteger(total) || total < 1 || total > 3000) { toast.error(t("imp_blank_range", "Write a number between 1 and 3000.")); return; }
    if (!(await askConfirm(t("imp_blank_confirm", "Make {{n}} slips without names? Each student will write their own name at the first sign-in. The slips work for {{d}} days.", { n: total, d: graceDays })))) return;
    next.current = 0; batchId.current = null; setCreds([]); setRejected([]); setProgress(0); setSaved(false);
    setMode("blank"); setBlankTotal(total); setPreview(null);
    runBlank(total);
  };

  const resume = () => (mode === "blank" ? runBlank(blankTotal) : preview && run(preview.rows.filter((r) => r.errors.length === 0)));

  const printSlips = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error(t("imp_popup", "Allow pop-ups for this site to print the slips.")); return; }
    w.document.write(slipsHtml(creds, graceDays, `${window.location.origin}/login`));
    w.document.close();
    setSaved(true);
  };

  const saveCsv = () => {
    download(new Blob([credentialsCsv(creds)], { type: "text/csv;charset=utf-8" }), "student-logins.csv");
    setSaved(true);
  };

  const again = () => {
    setPhase("choose"); setPreview(null); setCreds([]); setRejected([]); setProgress(0); setError(null); setSaved(false);
    next.current = 0; batchId.current = null; setMode("list");
  };

  const undo = async (b: ImportBatchRow) => {
    if (!(await askConfirm(t("imp_undo_confirm", "Remove the {{n}} accounts of this import that nobody has signed in to yet?", { n: b.created - b.signed_in })))) return;
    try {
      const res = await adminApi.undoImport(b.id);
      toast.success(t("imp_undone", "Removed {{n}} account(s). {{k}} kept because the student already signed in.", { n: res.deleted, k: res.kept }));
      loadBatches();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  const shownRows = preview ? (showAll ? preview.rows : [...preview.rows.filter((r) => r.errors.length), ...preview.rows.filter((r) => !r.errors.length)].slice(0, 25)) : [];
  const validCount = preview?.valid ?? 0;
  const target = mode === "blank" ? blankTotal : validCount;
  const pct = target ? Math.round((progress / target) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t("imp_title", "Register students from a list")}
        description={t("imp_desc", "Upload the organization's Excel list. Each student gets a made-up login email and a random password on a printed slip. The slip works for a few weeks; then the student adds a real email and chooses a new password.")}
        actions={<button onClick={getTemplate} className="btn-outline px-4 py-2 text-sm">{t("imp_template", "Download the Excel template")}</button>}
      />

      <SlipProgressPanel key={`${phase}-${batches.length}`} />

      {phase === "choose" && (
        <Card>
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("imp_step1", "1. Choose the file")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("imp_step1_hint", "An .xlsx or .csv file with First name, Father's name, Grandfather's name and Gender. Department, phone, dorm block, room and section are optional. Nothing is saved until you confirm the preview.")}</p>
          <input ref={fileInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          <button onClick={() => fileInput.current?.click()} disabled={busy} className="btn-primary px-5 py-2.5 text-sm">
            {busy ? t("adm_working", "Working...") : t("imp_choose", "Choose Excel or CSV file")}
          </button>
        </Card>
      )}

      {phase === "choose" && (
        <Card>
          <h2 className="mb-1 text-base font-semibold text-foreground">{t("imp_blank_title", "Or: slips without names")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("imp_blank_hint", "If you do not know the students' names yet, make a number of blank slips. Each slip has only an email and a password. The student signs in, writes their own name, and completes their profile.")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="blank-count">{t("imp_blank_count", "How many slips")}</label>
              <input id="blank-count" type="number" min={1} max={3000} className="input mt-1 w-32" value={blankCount} onChange={(e) => setBlankCount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="blank-grace">{t("imp_grace", "The slip works for")}</label>
              <select id="blank-grace" className="input mt-1 w-28" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))}>
                {[14, 21, 30, 45].map((d) => <option key={d} value={d}>{d} {t("days", "days")}</option>)}
              </select>
            </div>
            <button onClick={startBlank} className="btn-primary px-5 py-2.5 text-sm">{t("imp_blank_go", "Make the slips")}</button>
          </div>
        </Card>
      )}

      {phase === "preview" && preview && (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">{t("imp_step2", "2. Check the preview")}</h2>
              <Chip tone="green">{t("imp_ok_n", "{{n}} ready", { n: preview.valid })}</Chip>
              {preview.invalid > 0 && <Chip tone="red">{t("imp_bad_n", "{{n}} with errors (skipped)", { n: preview.invalid })}</Chip>}
              {preview.warnings > 0 && <Chip tone="amber">{t("imp_warn_n", "{{n}} possible duplicates", { n: preview.warnings })}</Chip>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{t("name", "Name")}</th><th className="px-3 py-2">{t("adm_gender", "Gender")}</th><th className="px-3 py-2">{t("phone", "Phone")}</th><th className="px-3 py-2">{t("imp_dorm", "Block / room / section")}</th><th className="px-3 py-2">{t("imp_status", "Status")}</th></tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (
                    <tr key={r.row} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-3 py-2">{r.gender ?? "—"}</td>
                      <td className="px-3 py-2">{r.phone || "—"}</td>
                      <td className="px-3 py-2">{[r.dorm_block, r.dorm_room, r.section].map((v) => v ?? "·").join(" / ")}</td>
                      <td className="px-3 py-2">
                        {r.errors.length === 0 && r.warnings.length === 0 && <Chip tone="green">{t("imp_ready", "Ready")}</Chip>}
                        {r.errors.map((e) => <div key={e} className="text-xs text-red-700">{e}</div>)}
                        {r.warnings.map((e) => <div key={e} className="text-xs text-amber-700">{e}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > shownRows.length && (
              <button onClick={() => setShowAll(true)} className="mt-3 text-sm text-primary hover:underline">{t("imp_show_all", "Show all {{n}} rows", { n: preview.rows.length })}</button>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-base font-semibold text-foreground">{t("imp_step3", "3. Confirm")}</h2>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <label htmlFor="grace" className="text-foreground">{t("imp_grace", "The slip works for")}</label>
              <select id="grace" className="input w-28" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))}>
                {[14, 21, 30, 45].map((d) => <option key={d} value={d}>{d} {t("days", "days")}</option>)}
              </select>
              <span className="text-muted-foreground">{t("imp_grace_hint", "After that the student must add a real email and choose a new password.")}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={start} disabled={validCount === 0} className="btn-primary px-5 py-2.5 text-sm">{t("imp_go", "Register {{n}} students", { n: validCount })}</button>
              <button onClick={again} className="btn-outline px-4 py-2.5 text-sm">{t("imp_other_file", "Choose another file")}</button>
            </div>
          </Card>
        </>
      )}

      {(phase === "running" || phase === "paused") && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-foreground">{t("imp_running", "Registering students...")}</h2>
          <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{t("imp_progress", "{{a}} of {{b}} done. Keep this page open.", { a: progress, b: target })}</p>
          {phase === "paused" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-2">{error}</p>
              <p className="mb-3">{t("imp_created_so_far", "{{n}} accounts are already created and their slips are below.", { n: creds.length })}</p>
              <button onClick={resume} className="btn-primary px-4 py-2 text-sm">{t("imp_continue", "Continue")}</button>
            </div>
          )}
        </Card>
      )}

      {(phase === "done" || (phase === "paused" && creds.length > 0)) && (
        <Card>
          <h2 className="mb-1 text-base font-semibold text-foreground">{phase === "done" ? t("imp_done", "Done: {{n}} students registered", { n: creds.length }) : t("imp_partial", "{{n}} slips ready so far", { n: creds.length })}</h2>
          <div className="my-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("imp_only_once", "These passwords are shown only now. The system keeps only a scrambled copy. Print the slips or save the Excel file before you leave this page. A lost slip can be replaced later.")}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={printSlips} disabled={creds.length === 0} className="btn-primary px-5 py-2.5 text-sm">{t("imp_print", "Print the slips")}</button>
            <button onClick={saveCsv} disabled={creds.length === 0} className="btn-outline px-4 py-2.5 text-sm">{t("imp_csv", "Save as Excel (CSV)")}</button>
            {phase === "done" && <button onClick={again} className="btn-outline px-4 py-2.5 text-sm">{t("imp_new", "Register another list")}</button>}
          </div>
          {rejected.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="mb-1 font-medium">{t("imp_rejected", "{{n}} rows were not registered", { n: rejected.length })}</p>
              <ul className="list-disc pl-5">{rejected.slice(0, 10).map((r) => <li key={r.row}>{t("imp_row", "Row {{n}}", { n: r.row })}: {r.errors.join(" ")}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t("imp_earlier", "Earlier imports")}</h2>
        {batches.length === 0 ? (
          <Empty>{t("imp_none", "No imports yet.")}</Empty>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-foreground">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="text-muted-foreground">{b.created_by ?? "-"} · {t("imp_counts", "{{c}} registered, {{s}} signed in, {{d}} finished setup", { c: b.created, s: b.signed_in, d: b.completed })}</span>
                  <span className="ml-auto">
                    {b.undone_at ? <Chip>{t("adm_undone", "undone")}</Chip> : b.created > b.signed_in && <button onClick={() => undo(b)} className="btn-outline px-3 py-1 text-xs text-destructive">{t("adm_undo", "Undo")}</button>}
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

export default ImportStudentsPage;
