import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { adminApi } from "../api";
import type { FamilyRow, ParentCandidate, ParentCandidates } from "../types";

type Picks = Record<number, number>; // person id -> family id

const byName = (a: FamilyRow, b: FamilyRow) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * The quick way to name fathers and mothers: the free, eligible people are listed, each with a "Put in family"
 * choice. "Fill automatically" proposes everything at once; Save sends all choices in one request.
 */
const FamilyParentsPanel = ({ families, onDone }: { families: FamilyRow[]; onDone: () => void }) => {
  const { t } = useTranslation();
  const [cand, setCand] = useState<ParentCandidates | null>(null);
  const [fatherPick, setFatherPick] = useState<Picks>({});
  const [motherPick, setMotherPick] = useState<Picks>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setCand(await adminApi.parentCandidates());
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const needFather = useMemo(() => families.filter((f) => !f.father).sort(byName), [families]);
  const needMother = useMemo(() => families.filter((f) => !f.mother).sort(byName), [families]);

  if (!cand || (needFather.length === 0 && needMother.length === 0)) return null;

  const term = search.trim().toLowerCase();
  const matches = (p: ParentCandidate) => !term || p.full_name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term);
  const chosen = Object.keys(fatherPick).length + Object.keys(motherPick).length;

  const fill = () => {
    const fathers: Picks = {};
    const mothers: Picks = {};
    needFather.forEach((fam, i) => { if (cand.fathers[i]) fathers[cand.fathers[i].id] = fam.id; });
    needMother.forEach((fam, i) => { if (cand.mothers[i]) mothers[cand.mothers[i].id] = fam.id; });
    setFatherPick(fathers);
    setMotherPick(mothers);
  };

  const save = async () => {
    const byFamily = new Map<number, { family_id: number; father_id?: number; mother_id?: number }>();
    const rowFor = (id: number) => { if (!byFamily.has(id)) byFamily.set(id, { family_id: id }); return byFamily.get(id)!; };
    Object.entries(fatherPick).forEach(([person, fam]) => { rowFor(fam).father_id = Number(person); });
    Object.entries(motherPick).forEach(([person, fam]) => { rowFor(fam).mother_id = Number(person); });
    setBusy(true);
    setFailed([]);
    try {
      const res = await adminApi.assignParents([...byFamily.values()]);
      if (res.applied > 0) toast.success(t("fp_saved", "{{n}} family(ies) saved.", { n: res.applied }));
      setFailed(res.results.filter((r) => !r.ok).map((r) => `${r.family_name}: ${Object.values(r.errors).join(" ")}`));
      setFatherPick({});
      setMotherPick({});
      await load();
      onDone();
    } catch {
      toast.error(t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const column = (
    title: string, people: ParentCandidate[], need: FamilyRow[], picks: Picks, setPicks: (p: Picks) => void, tone: string,
  ) => {
    const taken = new Set(Object.values(picks));
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
            {t("fp_counts", "{{f}} families need one · {{p}} free", { f: need.length, p: people.length })}
          </span>
        </div>
        {people.length < need.length && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("fp_short", "Not enough free people: {{n}} more are needed. Give the role to more students in year 2 or above.", { n: need.length - people.length })}
          </p>
        )}
        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {people.filter(matches).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{t("fp_year", "Year {{y}}", { y: p.year })}{p.department ? ` · ${p.department}` : ""}</p>
              </div>
              <select
                className="input w-40 py-1 text-sm"
                value={picks[p.id] ?? ""}
                aria-label={t("fp_put_in", "Put in family")}
                onChange={(e) => {
                  const next = { ...picks };
                  if (e.target.value) next[p.id] = Number(e.target.value); else delete next[p.id];
                  setPicks(next);
                }}
              >
                <option value="">{t("fp_put_in", "Put in family")}…</option>
                {need.filter((f) => !taken.has(f.id) || picks[p.id] === f.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          ))}
          {people.filter(matches).length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">{t("adm_no_users", "No users match your search.")}</p>}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-base font-semibold text-foreground">{t("fp_title", "Name the fathers and mothers")}</h2>
        <button type="button" onClick={fill} disabled={busy} className="btn-outline px-3 py-1.5 text-sm">{t("fp_fill", "Fill automatically")}</button>
        <button type="button" onClick={() => { setFatherPick({}); setMotherPick({}); }} disabled={busy || chosen === 0} className="btn-outline px-3 py-1.5 text-sm">{t("fp_clear", "Clear choices")}</button>
        <button type="button" onClick={save} disabled={busy || chosen === 0} className="btn-primary px-4 py-1.5 text-sm">
          {busy ? t("adm_working", "Working...") : t("fp_save", "Save {{n}} choice(s)", { n: chosen })}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("fp_hint", "Only free people who may be parents are listed: the right gender, year 2 or above, not a graduate, not already in a family. “Fill automatically” only proposes: you can change any choice before you save.")}
      </p>
      <input className="input mt-3 w-full sm:w-72" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("adm_search_users", "Search by name or email...")} />
      {failed.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <p className="mb-1 font-medium">{t("fp_failed", "These were not saved:")}</p>
          <ul className="list-disc pl-5">{failed.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <div className={`mt-4 grid gap-5 md:grid-cols-2 ${busy ? "opacity-60" : ""}`}>
        {column(t("fp_fathers", "Fathers (men)"), cand.fathers, needFather, fatherPick, setFatherPick, "bg-sky-50 text-sky-700")}
        {column(t("fp_mothers", "Mothers (women)"), cand.mothers, needMother, motherPick, setMotherPick, "bg-rose-50 text-rose-700")}
      </div>
    </Card>
  );
};

export default FamilyParentsPanel;
