import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchBar from "../../../components/ui/SearchBar";
import { adminApi } from "../api";
import type { AdminUser } from "../types";

export interface PickedUser { id: number; full_name: string; email?: string }

/**
 * Search for one person by name or email and pick them.
 * With `role`, only people who already hold that role are listed (and the list shows without typing).
 */
const UserPicker = ({
  value, onChange, label, role, hint,
}: { value: PickedUser | null; onChange: (u: PickedUser | null) => void; label: string; role?: string; hint?: string }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(false);
  const needsTyping = !role;

  useEffect(() => {
    if (needsTyping && search.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    const timer = setTimeout(() => {
      adminApi.users({ search: search.trim() || undefined, role })
        .then((d) => setResults(d.results.filter((u) => u.is_active)))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, role, needsTyping]);

  const showList = !needsTyping || search.trim().length >= 2;

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      {value ? (
        <div className="mt-1 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.full_name}</p>
            {value.email && <p className="truncate text-xs text-muted-foreground">{value.email}</p>}
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-destructive hover:underline">{t("adm_remove", "Remove")}</button>
        </div>
      ) : (
        <div className="mt-1">
          <SearchBar value={search} onChange={setSearch} placeholder={t("adm_search_users", "Search by name or email...")} />
          {showList && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
              {busy ? (
                <p className="p-3 text-center text-sm text-muted-foreground">{t("adm_working", "Working...")}</p>
              ) : results.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  {role && !search.trim()
                    ? t("adm_no_role_users", "Nobody holds this role yet. Give it in Users & roles first.")
                    : t("adm_no_users", "No users match your search.")}
                </p>
              ) : (
                results.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => { onChange({ id: u.id, full_name: u.full_name, email: u.email }); setSearch(""); }}
                    className="block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                  >
                    <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserPicker;
