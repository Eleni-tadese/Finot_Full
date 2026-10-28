import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { ParentPool, PoolPerson } from "../types";

const TONE = { M: "bg-sky-50 text-sky-700", F: "bg-rose-50 text-rose-700" } as const;

/**
 * Who may become a father or mother. Choose people (the Super Admin or the Family Admin, after an informal
 * recommendation), mark them trained once the training is done: only trained people can be put in a family.
 */
const ParentCandidatesPanel = ({ onChange }: { onChange: () => void }) => {
  const { t } = useTranslation();
  const [pool, setPool] = useState<ParentPool | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async (term: string) => {
    try {
      setPool(await adminApi.parentPool(term.trim() || undefined));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  const run = async (id: number, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
      await load(search);
      onChange();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(null);
    }
  };

  if (!pool) return null;
  const selected = pool.chosen.filter((c) => c.status === "SELECTED");
  const trained = pool.chosen.filter((c) => c.status === "TRAINED");

  const who = (p: PoolPerson) => (
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">{p.full_name}</p>
      <p className="truncate text-xs text-muted-foreground">
        <span className={`mr-1.5 rounded-full px-2 py-0.5 ${p.gender ? TONE[p.gender] : "bg-muted"}`}>
          {p.gender === "F" ? t("fp_mother_tag", "mother") : t("fp_father_tag", "father")}
        </span>
        {t("fp_year", "Year {{n}}", { n: p.year ?? "?" })}{p.department ? ` · ${p.department}` : ""}
      </p>
    </div>
  );

  return (
    <Card>
      <h2 className="text-base font-semibold text-foreground">{t("pc_title", "Who may become a father or mother")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("pc_hint", "1. Choose a student (year 2 or above, not a graduate). 2. After the training, press “Mark trained”. 3. Only trained people appear in “Name the fathers and mothers” below.")}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t("pc_selected", "Chosen, waiting for training")} <span className="text-muted-foreground">({selected.length})</span>
          </h3>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {selected.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("pc_none_selected", "Nobody yet.")}</p>}
            {selected.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2.5">
                {who(c)}
                {c.note && <span className="hidden max-w-[8rem] truncate text-xs text-muted-foreground sm:block" title={c.note}>{c.note}</span>}
                <button disabled={busy === c.id} onClick={() => run(c.id, () => adminApi.updateParent(c.id, { status: "TRAINED" }))} className="btn-primary px-2.5 py-1 text-xs">{t("pc_mark_trained", "Mark trained")}</button>
                <button disabled={busy === c.id} onClick={() => run(c.id, () => adminApi.removeParent(c.id))} className="text-xs text-destructive hover:underline">{t("adm_remove", "Remove")}</button>
              </div>
            ))}
          </div>

          <h3 className="mt-4 text-sm font-semibold text-foreground">
            {t("pc_trained", "Trained, ready for a family")} <span className="text-muted-foreground">({trained.length})</span>
          </h3>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {trained.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("pc_none_trained", "Nobody yet.")}</p>}
            {trained.map((c) => (
              <div key={c.id} className="flex items-center gap-2 p-2.5">
                {who(c)}
                {c.assigned && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t("pc_leads", "leads a family")}</span>}
                {!c.assigned && (
                  <>
                    <button disabled={busy === c.id} onClick={() => run(c.id, () => adminApi.updateParent(c.id, { status: "SELECTED" }))} className="text-xs text-muted-foreground hover:underline">{t("pc_not_trained", "Not trained")}</button>
                    <button disabled={busy === c.id} onClick={() => run(c.id, () => adminApi.removeParent(c.id))} className="text-xs text-destructive hover:underline">{t("adm_remove", "Remove")}</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("pc_suggestions", "Students who meet the requirements")}</h3>
          <input
            className="input mt-2 w-full" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("adm_search_users", "Search by name or email...")}
          />
          <div className="mt-2 max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {pool.suggestions.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t("adm_no_users", "No users match your search.")}</p>}
            {pool.suggestions.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2.5">
                {who(p)}
                <input
                  className="input hidden w-28 py-1 text-xs sm:block" maxLength={200} value={note[p.id] ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                  placeholder={t("pc_note", "Who recommended?")}
                />
                <button disabled={busy === p.id} onClick={() => run(p.id, () => adminApi.chooseParent(p.id, note[p.id]))} className="btn-outline px-2.5 py-1 text-xs">{t("pc_choose", "Choose")}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ParentCandidatesPanel;
