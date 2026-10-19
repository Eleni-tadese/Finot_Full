import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { adminApi } from "../api";
import type { SlipFilter, SlipProgress, SlipRow, SlipStep } from "../types";
import { Chip, Empty } from "./AdminUi";

type Tone = "muted" | "amber" | "primary" | "green" | "red";

const TILES: { key: SlipFilter; tone: Tone }[] = [
  { key: "never", tone: "amber" },
  { key: "no_name", tone: "amber" },
  { key: "on_slip", tone: "primary" },
  { key: "needs_password", tone: "primary" },
  { key: "done", tone: "green" },
  { key: "expired", tone: "red" },
];

/** Where every login slip stands: one number per step, a filterable list and an Excel download. */
const SlipProgressPanel = ({ batchId }: { batchId?: number | null }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SlipFilter>("not_done");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SlipProgress | null>(null);
  const [failed, setFailed] = useState(false);

  const stepLabel = (s: SlipStep | "expired") =>
    ({
      never: t("slip_never", "Has not signed in"),
      no_name: t("slip_no_name", "Signed in, name not written"),
      on_slip: t("slip_on_slip", "Named, still on the slip email"),
      needs_password: t("slip_needs_password", "Real email set, password not changed"),
      done: t("slip_done", "Finished"),
      expired: t("slip_expired", "Deadline passed, not finished"),
    })[s];

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setData(await adminApi.slipProgress({ state: filter, q: query, batch: batchId, page }));
    } catch {
      setFailed(true);
    }
  }, [filter, query, batchId, page]);
  useEffect(() => { load(); }, [load]);

  const pick = (key: SlipFilter) => { setFilter(key); setPage(1); };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); setQuery(search.trim()); setPage(1); };

  const download = async () => {
    try {
      const blob = await adminApi.slipProgressExport({ state: filter, q: query, batch: batchId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "slip-progress.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("export_failed"));
    }
  };

  if (failed) return null; // the report is optional: the page still works without it
  if (!data) return null;
  const s = data.summary;
  if (s.total === 0) return null;
  const pct = Math.round((s.done / s.total) * 100);
  const lastPage = Math.max(1, Math.ceil(data.count / 20));

  const when = (r: SlipRow) => {
    if (r.step === "done") return <Chip tone="green">{t("slip_done", "Finished")}</Chip>;
    if (r.expired) return <Chip tone="red">{t("slip_locked", "Locked out")}</Chip>;
    return <Chip tone={r.days_left <= 3 ? "amber" : "muted"}>{t("slip_days_left", "{{n}} days left", { n: r.days_left })}</Chip>;
  };

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-foreground">{t("slip_title", "Slip progress")}</h2>
        <Chip tone="green">{t("slip_pct", "{{n}}% finished", { n: pct })}</Chip>
        <span className="text-sm text-muted-foreground">{t("slip_total", "{{n}} slips in all", { n: s.total })}</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("slip_hint", "Each student is in one step. Press a number to see those students. After the deadline, students who are not finished are locked out until they finish.")}</p>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TILES.map(({ key, tone }) => (
          <button
            key={key}
            onClick={() => pick(filter === key ? "not_done" : key)}
            className={`rounded-xl border p-3 text-left transition ${filter === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
            aria-pressed={filter === key}
          >
            <div className={`text-2xl font-semibold ${tone === "red" ? "text-red-700" : "text-foreground"}`}>{s[key as keyof typeof s]}</div>
            <div className="text-xs text-muted-foreground">{stepLabel(key as SlipStep | "expired")}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 text-xs">
          {([["not_done", t("slip_f_open", "Not finished")], ["", t("slip_f_all", "Everyone")]] as [SlipFilter, string][]).map(([k, label]) => (
            <button key={k || "all"} onClick={() => pick(k)} className={filter === k ? "btn-primary px-3 py-1" : "btn-outline px-3 py-1"}>{label}</button>
          ))}
        </div>
        <form onSubmit={submitSearch} className="flex gap-2">
          <input className="input w-52" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("slip_search", "Search name or login email")} aria-label={t("slip_search", "Search name or login email")} />
          <button className="btn-outline px-3 py-1 text-xs">{t("search", "Search")}</button>
        </form>
        <button onClick={download} className="btn-outline ml-auto px-3 py-1 text-xs">{t("slip_download", "Download this list (Excel)")}</button>
      </div>

      {data.results.length === 0 ? (
        <Empty>{t("slip_empty", "No students in this step.")}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">{t("name", "Name")}</th><th className="px-3 py-2">{t("slip_login", "Login email")}</th><th className="px-3 py-2">{t("imp_status", "Status")}</th><th className="px-3 py-2">{t("slip_deadline", "Deadline")}</th></tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{r.name || <span className="font-normal text-muted-foreground">{t("slip_no_name_yet", "(no name yet)")}</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-3 py-2">{stepLabel(r.step)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.deadline).toLocaleDateString()} {when(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="mt-3 flex items-center justify-end gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-outline px-3 py-1 text-xs">{t("previous", "Previous")}</button>
          <span className="text-muted-foreground">{page} / {lastPage}</span>
          <button disabled={page >= lastPage} onClick={() => setPage(page + 1)} className="btn-outline px-3 py-1 text-xs">{t("next", "Next")}</button>
        </div>
      )}
    </Card>
  );
};

export default SlipProgressPanel;
