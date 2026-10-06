import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { firstApiError } from "../../features/resources/utils";
import { Modal } from "../../features/admin-console/components/AdminUi";
import { api } from "../../lib/api";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { formatDay, parseYmd, weekdayNames, ymd } from "../../lib/dates";

interface Props {
  courseId: string;
  /** Dates ("YYYY-MM-DD") that already have a class day, so they are not made twice. */
  existing: Set<string>;
  onClose: () => void;
  onDone: () => void;
}

const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * Plan many class days at once: pick the weekdays the class normally meets and a period, then adjust the list
 * (untick holidays, add one-off dates) before creating them. Real life moves, so nothing is forced.
 */
const PlanClassDaysModal = ({ courseId, existing, onClose, onDone }: Props) => {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const today = new Date();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [from, setFrom] = useState(ymd(today));
  const [to, setTo] = useState(ymd(addDays(today, 7 * 15)));
  const [extras, setExtras] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [teacher, setTeacher] = useState("");
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => weekdayNames(i18n.language), [i18n.language]);

  // Every date in the period that falls on a chosen weekday, plus the one-off dates, oldest first.
  const dates = useMemo(() => {
    const found = new Set<string>(extras);
    if (weekdays.length > 0 && from && to) {
      const start = parseYmd(from);
      const end = parseYmd(to);
      for (let d = start, guard = 0; d <= end && guard < 400; d = addDays(d, 1), guard++) {
        if (weekdays.includes(d.getDay())) found.add(ymd(d));
      }
    }
    return Array.from(found).sort();
  }, [weekdays, from, to, extras]);

  const chosen = dates.filter((d) => !existing.has(d) && !off.has(d));

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((x) => x !== day) : [...prev, day]));
  const toggleDate = (date: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  const addExtra = () => {
    if (!extraInput) return;
    setExtras((prev) => (prev.includes(extraInput) ? prev : [...prev, extraInput]));
    setOff((prev) => { const next = new Set(prev); next.delete(extraInput); return next; });
    setExtraInput("");
  };

  // Closing with dates picked but not created would silently throw the plan away
  const attemptClose = async () => {
    if (chosen.length > 0 && !(await confirm({
      message: t("cd_close_confirm", "You picked {{n}} date(s) that are not created yet. Close and lose this plan?", { n: chosen.length }),
      confirmLabel: t("cd_close_yes", "Close and lose the plan"),
    }))) return;
    onClose();
  };

  const create = async () => {
    setSaving(true);
    try {
      const r = await api.bulkCreateSessions(courseId, chosen, teacher.trim() || undefined);
      toast.success(t("cd_created", "{{n}} class day(s) created.", { n: r.created }));
      onDone();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("cd_plan", "Plan class days")}
      onClose={attemptClose}
      wide
      footer={<>
        <button className="btn-outline" onClick={attemptClose}>{t("cancel", "Cancel")}</button>
        <button className="btn-primary" disabled={saving || chosen.length === 0} onClick={create}>
          {saving ? t("adm_working", "Working...") : t("cd_create_n", "Create {{n}} class day(s)", { n: chosen.length })}
        </button>
      </>}
    >
      <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        {t("cd_not_saved_note", "Nothing is saved until you press the Create button at the bottom.")}
      </p>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("cd_plan_desc", "Pick the weekdays the class normally meets and the period. You get a list of dates: untick any that will not happen (a holiday, an exam) and add one-off dates. Then create them all at once.")}
      </p>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">{t("cd_weekdays", "The class meets on")}</p>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => toggleWeekday(d.day)}
                className={`rounded-xl border px-3.5 py-1.5 text-sm font-medium transition ${weekdays.includes(d.day) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">{t("cd_from", "From")}
            <input type="date" className="input mt-1 w-full" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">{t("cd_to", "To")}
            <input type="date" className="input mt-1 w-full" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <label className="block text-sm font-medium">{t("teacher_name_optional", "Teacher name (optional)")}
          <input className="input mt-1 w-full" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder={t("guest_lecturer_name", "Guest lecturer name")} />
        </label>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">{t("cd_extra", "Add another date (a make-up class, a changed day)")}</p>
          <div className="flex gap-2">
            <input type="date" className="input flex-1" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} />
            <button type="button" className="btn-outline px-4" disabled={!extraInput} onClick={addExtra}>{t("adm_add", "Add")}</button>
          </div>
        </div>

        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
            <span className="font-medium text-foreground">{t("cd_dates_found", "{{n}} date(s) in the plan", { n: dates.length })}</span>
            <span className="text-muted-foreground">{t("cd_selected", "{{n}} will be created", { n: chosen.length })}</span>
          </div>
          {dates.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("cd_none", "Pick at least one weekday and a period, or add a date.")}</p>
          ) : (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {dates.map((d) => {
                const exists = existing.has(d);
                return (
                  <li key={d}>
                    <label className={`flex items-center gap-3 px-3 py-2 text-sm ${exists ? "opacity-50" : "cursor-pointer hover:bg-muted/50"}`}>
                      <input type="checkbox" className="h-4 w-4" disabled={exists} checked={!exists && !off.has(d)} onChange={() => toggleDate(d)} />
                      <span className="flex-1 text-foreground">{formatDay(d, i18n.language)}</span>
                      {exists && <span className="text-xs text-muted-foreground">{t("cd_already", "already added")}</span>}
                      {extras.includes(d) && !exists && <span className="text-xs text-primary">{t("cd_one_off", "one-off")}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PlanClassDaysModal;
