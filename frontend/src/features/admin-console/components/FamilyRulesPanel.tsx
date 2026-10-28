import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { DistributionSetup, Factor, PlanResult, Spread, SpreadMode } from "../types";
import { Chip } from "./AdminUi";

const MODES: SpreadMode[] = ["mix", "together", "ignore"];

/**
 * The Family Admin's rules for this year's distribution: family size, women : men ratio, how to treat the university
 * section and the dorm block (mix / together / ignore) and which factor counts first. Preview shows every family and
 * the students who did not fit; nothing is saved until Confirm.
 */
const FamilyRulesPanel = ({ onDone }: { onDone: () => void }) => {
  const { t } = useTranslation();
  const askConfirm = useConfirm();
  const [setup, setSetup] = useState<DistributionSetup | null>(null);
  const [size, setSize] = useState("");
  const [picked, setPicked] = useState<number | "custom">(0);
  const [female, setFemale] = useState("");
  const [male, setMale] = useState("");
  const [sectionMode, setSectionMode] = useState<SpreadMode>("mix");
  const [dormMode, setDormMode] = useState<SpreadMode>("mix");
  const [priority, setPriority] = useState<Factor[]>(["section", "dorm", "gender"]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [placed, setPlaced] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSetup = useCallback(async (wanted?: number) => {
    try {
      const s = await adminApi.distributionSetup(wanted);
      setSetup(s);
      setSize(String(s.size));
      setPicked(0);
      if (s.ratios.length > 0) { setFemale(String(s.ratios[0].female)); setMale(String(s.ratios[0].male)); }
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);

  useEffect(() => { loadSetup(); }, [loadSetup]);

  if (!setup) return null;
  if (setup.students.total === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">{t("fr_nobody", "No first-year student is waiting for a family.")}</p>
      </Card>
    );
  }

  const modeLabel = (m: SpreadMode, what: "section" | "dorm") =>
    m === "mix"
      ? t(`fr_${what}_mix`, what === "section" ? "Mix: spread each section over different families" : "Mix: spread each dorm over different families")
      : m === "together"
        ? t(`fr_${what}_together`, what === "section" ? "Together: keep each section in the same family" : "Together: keep each dorm in the same family")
        : t("fr_ignore", "Ignore: do not use it");
  const factorLabel = (f: Factor) =>
    f === "section" ? t("fr_f_section", "University section") : f === "dorm" ? t("fr_f_dorm", "Dorm block") : t("fr_f_gender", "Women and men balance");

  const move = (index: number, delta: number) => {
    const next = [...priority];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setPriority(next);
  };

  const unknown = t("fr_unknown", "not on file");
  // "315 (12), 49 (1)": the value and how many students have it
  const spread = (rows: Spread[]) => rows.map((r) => `${r.value ?? unknown} (${r.count})`).join(", ");
  // the dorm blocks of one gender: women and men live in different blocks, so each list is read on its own
  const blocksOf = (who: "women" | "men") =>
    setup.dorm_blocks.filter((r) => r.value !== null && (r[who] ?? 0) > 0).map((r) => `${r.value} (${r[who]})`);
  const noBlock = setup.dorm_blocks.find((r) => r.value === null)?.count ?? 0;
  const noSection = setup.sections.find((r) => r.value === null)?.count ?? 0;

  const problem = (): string => {
    const s = Number(size), f = Number(female), m = Number(male);
    if (!Number.isInteger(s) || s < 2) return t("fr_bad_size", "The family size must be 2 or more.");
    if (!Number.isInteger(f) || !Number.isInteger(m) || f < 1 || m < 1) return t("fr_bad_ratio", "Each family needs at least 1 woman and 1 man.");
    if (f + m > s) return t("fr_ratio_over", "{{f}} + {{m}} is more than the family size {{s}}.", { f, m, s });
    return "";
  };

  const run = async (placeRemaining: boolean) => {
    const why = problem();
    if (why) { toast.error(why); return; }
    setBusy(true);
    try {
      setResult(await adminApi.planDistribution({
        size: Number(size), female_per_family: Number(female), male_per_family: Number(male),
        section_mode: sectionMode, dorm_mode: dormMode, priority, place_remaining: placeRemaining,
      }));
      setPlaced(placeRemaining);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!result) return;
    const ok = await askConfirm(t("fr_confirm_q", "Create {{f}} families with {{n}} students? You can undo this afterwards.", { f: result.new_families.length, n: result.pairs.length }));
    if (!ok) return;
    setBusy(true);
    try {
      const res = await adminApi.confirmDistribution(result.pairs, result.new_families, Number(size));
      toast.success(t("adm_assigned_n", "Assigned {{n}} student(s). You can undo this below.", { n: res.applied }));
      res.skipped.slice(0, 3).forEach((s) => toast.error(s));
      setResult(null);
      await loadSetup();
      onDone();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold text-foreground">{t("fr_title", "Make the families for this year")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("fr_counts", "{{n}} first-year student(s) are waiting for a family: {{w}} women and {{m}} men.", { n: setup.students.total, w: setup.students.women, m: setup.students.men })}
          {setup.students.no_gender > 0 && ` ${t("fr_no_gender", "{{n}} have no gender on file; they will be among the remaining students.", { n: setup.students.no_gender })}`}
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="fr-size">{t("fr_size", "Students in one family")}</label>
            <div className="mt-1 flex items-center gap-2">
              <input id="fr-size" type="number" min={2} max={100} className="input w-24" value={size} onChange={(e) => setSize(e.target.value)} />
              <button type="button" className="btn-outline px-3 py-2 text-sm" disabled={busy || !Number.isInteger(Number(size)) || Number(size) < 2}
                onClick={() => { setResult(null); loadSetup(Number(size)); }}>{t("fr_update", "Update")}</button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("fr_size_hint", "This makes {{n}} families. The father and mother are not counted.", { n: setup.families })}</p>
          </div>
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-foreground">{t("fr_ratio", "Women : men in each family")}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {setup.ratios.map((r, i) => (
            <label key={`${r.female}-${r.male}`} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${picked === i ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="fr-ratio" className="mr-2" checked={picked === i}
                onChange={() => { setPicked(i); setFemale(String(r.female)); setMale(String(r.male)); }} />
              <span className="font-medium text-foreground">{r.female} : {r.male}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {r.left_total === 0
                  ? t("fr_ratio_exact", "Fits everybody: no student is left over.")
                  : t("fr_ratio_left", "{{n}} student(s) left over ({{w}} women, {{m}} men), placed at the end.", { n: r.left_total, w: r.left_female, m: r.left_male })}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="fr-ratio" checked={picked === "custom"} onChange={() => setPicked("custom")} />
            {t("fr_ratio_own", "My own ratio")}
          </label>
          <input type="number" min={1} className="input w-20" aria-label={t("female", "Female")} value={female}
            onChange={(e) => { setPicked("custom"); setFemale(e.target.value); }} />
          <span>:</span>
          <input type="number" min={1} className="input w-20" aria-label={t("male", "Male")} value={male}
            onChange={(e) => { setPicked("custom"); setMale(e.target.value); }} />
          <span className="text-xs text-muted-foreground">{t("fr_women_men", "women : men")}</span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="fr-section">{t("fr_f_section", "University section")}</label>
            <select id="fr-section" className="input mt-1 w-full" value={sectionMode} onChange={(e) => setSectionMode(e.target.value as SpreadMode)}>
              {MODES.map((m) => <option key={m} value={m}>{modeLabel(m, "section")}</option>)}
            </select>
            <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
              {setup.sections.filter((r) => r.value !== null).map((r) => (
                <p key={r.value}>{t("fr_sec_line", "Section {{v}}: {{n}} students ({{w}} women, {{m}} men)", { v: r.value, n: r.count, w: r.women ?? 0, m: r.men ?? 0 })}</p>
              ))}
              {noSection > 0 && (
                <p className="font-medium text-amber-700">{t("fr_sec_none", "{{n}} student(s) have no section on file. Mix and Together cannot use it for them.", { n: noSection })}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="fr-dorm">{t("fr_f_dorm", "Dorm block")}</label>
            <select id="fr-dorm" className="input mt-1 w-full" value={dormMode} onChange={(e) => setDormMode(e.target.value as SpreadMode)}>
              {MODES.map((m) => <option key={m} value={m}>{modeLabel(m, "dorm")}</option>)}
            </select>
            <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
              {blocksOf("women").length > 0 && (
                <p>{t("fr_dorm_women", "Women live in {{k}} dorm block(s) (block number: students): {{list}}", { k: blocksOf("women").length, list: blocksOf("women").join(", ") })}</p>
              )}
              {blocksOf("men").length > 0 && (
                <p>{t("fr_dorm_men", "Men live in {{k}} dorm block(s) (block number: students): {{list}}", { k: blocksOf("men").length, list: blocksOf("men").join(", ") })}</p>
              )}
              {noBlock > 0 && <p className="font-medium text-amber-700">{t("fr_dorm_none", "{{n}} student(s) have no dorm block on file.", { n: noBlock })}</p>}
              <p>{t("fr_dorm_note", "Women and men live in different blocks. Each student is compared only with students of the same block, so the women's blocks are spread among the women and the men's blocks among the men.")}</p>
            </div>
          </div>
        </div>

        <h3 className="mb-1 mt-6 text-sm font-semibold text-foreground">{t("fr_priority", "What counts first when the rules disagree")}</h3>
        <ol className="space-y-1">
          {priority.map((f, i) => (
            <li key={f} className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-5 text-muted-foreground">{i + 1}.</span>
              <span className="flex-1">{factorLabel(f)}</span>
              <button type="button" className="btn-outline px-2 py-0.5 text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("fr_up", "Move up")}>↑</button>
              <button type="button" className="btn-outline px-2 py-0.5 text-xs" disabled={i === priority.length - 1} onClick={() => move(i, 1)} aria-label={t("fr_down", "Move down")}>↓</button>
            </li>
          ))}
        </ol>

        <button onClick={() => run(false)} disabled={busy} className="btn-primary mt-6 px-4 py-2 text-sm">
          {busy ? t("adm_working", "Working...") : t("adm_preview", "Preview distribution")}
        </button>
      </Card>

      {result && (
        <>
          <Card>
            <p className="text-sm text-foreground">
              {t("fr_result", "{{p}} of {{n}} students placed in {{f}} families. Nothing has been saved yet.", { p: result.summary.placed, n: result.summary.students, f: result.summary.families })}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={confirm} disabled={busy || result.pairs.length === 0} className="btn-primary px-4 py-2 text-sm">
                {t("adm_confirm_n", "Confirm and assign {{n}}", { n: result.pairs.length })}
              </button>
              {result.remaining.length > 0 && !placed && (
                <button onClick={() => run(true)} disabled={busy} className="btn-outline px-4 py-2 text-sm">{t("fr_place_rest", "Place the remaining students too")}</button>
              )}
              <button onClick={() => setResult(null)} disabled={busy} className="btn-outline px-4 py-2 text-sm">{t("adm_back", "Back")}</button>
            </div>
          </Card>

          {result.remaining.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 font-medium">{t("fr_remaining_n", "{{n}} remaining student(s)", { n: result.remaining.length })}</p>
              <p className="mb-2 text-xs">{t("fr_remaining_hint", "They did not fit the ratio. Press “Place the remaining students too” to put them in the families that have room, or leave them for later.")}</p>
              <ul className="list-disc pl-5">{result.remaining.map((u) => <li key={u.id}>{u.name} ({u.gender ?? "?"})</li>)}</ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {result.rows.map((row) => (
              <Card key={row.family_id}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{row.family_name}</span>
                  <Chip>{row.total}</Chip>
                  <span className="text-xs text-muted-foreground">{t("adm_gender_mix", "{{f}} women, {{m}} men", { f: row.women, m: row.men })}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("fr_sections", "Sections")}: {spread(row.sections)}</p>
                <p className="mb-2 text-xs text-muted-foreground">{t("fr_blocks", "Dorm blocks")}: {spread(row.dorm_blocks)}</p>
                <ul className="grid gap-x-4 gap-y-0.5 text-sm text-foreground">
                  {row.members.map((s) => <li key={s.id} className="truncate">{s.name}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FamilyRulesPanel;
