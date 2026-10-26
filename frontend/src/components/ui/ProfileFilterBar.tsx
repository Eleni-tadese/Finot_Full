import { FiFilter, FiX } from "react-icons/fi";
import { useTranslation } from "react-i18next";

export interface FilterField {
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
}

interface Props {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

/** A row of labelled dropdowns. Works on the server's values or on a list that is already loaded. */
const FilterBar = ({ fields, values, onChange, onClear }: Props) => {
  const { t } = useTranslation();
  const active = Object.values(values).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <FiFilter className="h-4 w-4 text-primary" />
          {t("flt_title", "Filters")}
          {active > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{active}</span>}
        </span>
        {active > 0 && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline">
            <FiX className="h-3.5 w-3.5" />
            {t("flt_clear", "Clear filters")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{f.label}</span>
            <select
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className={`input py-2 text-sm ${values[f.key] ? "border-primary bg-primary/5" : ""}`}
            >
              <option value="">{t("flt_all", "All")}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.count === undefined ? o.label : `${o.label} (${o.count})`}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
};

export default FilterBar;
