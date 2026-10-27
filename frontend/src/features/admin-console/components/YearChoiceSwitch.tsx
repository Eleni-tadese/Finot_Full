import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { adminApi } from "../api";

/** Super Admin switch: may a student who signs in with a slip choose their own year (1 to 5)? Off = everyone is year 1. */
const YearChoiceSwitch = () => {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.registrationSettings().then((r) => setOn(r.allow_year_choice)).catch(() => setOn(null));
  }, []);

  const change = async (next: boolean) => {
    setBusy(true);
    try {
      const r = await adminApi.updateRegistrationSettings(next);
      setOn(r.allow_year_choice);
      toast.success(t("adm_saved", "Saved."));
    } catch {
      toast.error(t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  if (on === null) return null;
  return (
    <Card className="mb-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={on} disabled={busy} onChange={(e) => change(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium text-foreground">{t("adm_year_choice", "Students choose their own year")}</span>
          <span className="block text-xs text-muted-foreground">
            {on
              ? t("adm_year_choice_on", "On: a student who signs in with a slip chooses year 1 to 5 once, and the choice is trusted. You can correct it in Users & roles.")
              : t("adm_year_choice_off", "Off: everyone who signs in with a slip is a first-year student and cannot choose.")}
          </span>
        </span>
      </label>
    </Card>
  );
};

export default YearChoiceSwitch;
