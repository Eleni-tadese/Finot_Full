import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Pagination from "../../../components/ui/Pagination";
import SearchBar from "../../../components/ui/SearchBar";
import { Card } from "../../../components/ui/Card";
import ExportButton from "../../export/components/ExportButton";
import { adminApi, PAGE_SIZE } from "../api";
import type { DonationRow, DonationsPage } from "../types";
import { Chip, Empty, Loading, PageHeader } from "./AdminUi";

const money = (value: number | string, currency = "ETB") =>
  `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const STATUS_TONE = { COMPLETED: "green", PENDING: "amber", FAILED: "red" } as const;

const DonationsAdminPage = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DonationsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = { search: debounced || undefined, ...filters };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.donations({ ...params, page }));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filters, page, t]);

  useEffect(() => { load(); }, [load]);

  // Ask Chapa now about every pending payment (a donor on localhost is never sent back to confirm it)
  const checkPending = async () => {
    setChecking(true);
    try {
      const r = await adminApi.recheckDonations();
      toast.success(t("don_checked", "{{n}} payment(s) checked: {{c}} confirmed, {{f}} marked failed.", { n: r.checked, c: r.completed, f: r.failed }));
      await load();
    } catch {
      toast.error(t("adm_save_failed", "Could not save."));
    } finally {
      setChecking(false);
    }
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
    setPage(1);
  };

  const exportQuery = new URLSearchParams(
    Object.entries({ ...params }).filter(([, v]) => v) as [string, string][]
  ).toString();

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <select value={filters[key] ?? ""} onChange={(e) => setFilter(key, e.target.value)} className="input py-2 text-sm" aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const s = data?.summary;
  const hasFilter = Object.keys(filters).length > 0 || !!debounced;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("don_title", "Donations")}
        description={t("don_desc", "Every donation, from students and from visitors without an account. Money collected counts only payments that Chapa confirmed.")}
        actions={
          <>
            <button onClick={checkPending} disabled={checking} className="btn-outline text-sm px-4 py-2">
              {checking ? t("don_checking", "Checking...") : t("don_check_pending", "Check pending payments")}
            </button>
            <ExportButton path={`donations/${exportQuery ? `?${exportQuery}` : ""}`} />
          </>
        }
      />

      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><p className="text-sm text-muted-foreground">{t("don_collected", "Collected")}</p><p className="mt-1 text-2xl font-bold text-foreground">{money(s.collected)}</p><p className="text-xs text-muted-foreground">{t("don_n_completed", "{{n}} confirmed payment(s)", { n: s.completed })}</p></Card>
          <Card><p className="text-sm text-muted-foreground">{t("don_pending", "Pending")}</p><p className="mt-1 text-2xl font-bold text-amber-600">{s.pending}</p><p className="text-xs text-muted-foreground">{t("don_pending_hint", "Started but not confirmed yet")}</p></Card>
          <Card><p className="text-sm text-muted-foreground">{t("don_failed", "Failed")}</p><p className="mt-1 text-2xl font-bold text-red-600">{s.failed}</p><p className="text-xs text-muted-foreground">{t("don_failed_hint", "Cancelled or not paid")}</p></Card>
          <Card>
            <p className="text-sm text-muted-foreground">{t("don_by_fund", "By fund")}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {s.by_fund.filter((f) => Number(f.amount) > 0).length === 0
                ? <li className="text-muted-foreground">—</li>
                : s.by_fund.filter((f) => Number(f.amount) > 0).map((f) => (
                    <li key={f.key} className="flex justify-between gap-2"><span className="text-muted-foreground">{t(`don_fund_${f.key}`, f.label)}</span><span className="font-medium text-foreground">{money(f.amount)}</span></li>
                  ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="md:col-span-3 lg:col-span-2"><SearchBar value={search} onChange={setSearch} placeholder={t("don_search", "Search name, email or reference...")} /></div>
        {select("status", t("don_all_status", "All statuses"), [
          { value: "COMPLETED", label: t("don_completed", "Completed") },
          { value: "PENDING", label: t("don_pending", "Pending") },
          { value: "FAILED", label: t("don_failed", "Failed") },
        ])}
        {select("kind", t("don_all_donors", "Students and guests"), [
          { value: "student", label: t("don_students", "Students") },
          { value: "guest", label: t("don_guests", "Guests (no account)") },
        ])}
        {select("fund", t("don_all_funds", "All funds"), [
          { value: "support", label: t("don_fund_support", "Support (visitors)") },
          { value: "weekly", label: t("don_fund_weekly", "Weekly donation (students)") },
          { value: "building", label: t("don_fund_building", "Building fund") },
          { value: "charity", label: t("don_fund_charity", "Charity") },
          { value: "special", label: t("don_fund_special", "Special events") },
          { value: "other", label: t("don_fund_other", "Other") },
        ])}
        {hasFilter && (
          <button onClick={() => { setFilters({}); setSearch(""); setPage(1); }} className="btn-outline px-3 py-2 text-sm">{t("flt_clear", "Clear filters")}</button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{t("don_from", "From")}</span>
        <input type="date" className="input w-auto py-1.5 text-sm" value={filters.date_from ?? ""} onChange={(e) => setFilter("date_from", e.target.value)} />
        <span>{t("don_to", "to")}</span>
        <input type="date" className="input w-auto py-1.5 text-sm" value={filters.date_to ?? ""} onChange={(e) => setFilter("date_to", e.target.value)} />
      </div>

      {loading && !data ? (
        <Loading />
      ) : !data || data.results.length === 0 ? (
        <Empty>{hasFilter ? t("don_none_match", "No donation matches these filters.") : t("don_none", "No donation yet.")}</Empty>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("don_col_date", "Date")}</th>
                  <th className="px-4 py-3">{t("don_col_donor", "Donor")}</th>
                  <th className="px-4 py-3">{t("don_col_fund", "Fund")}</th>
                  <th className="px-4 py-3 text-right">{t("don_col_amount", "Amount")}</th>
                  <th className="px-4 py-3">{t("don_col_status", "Status")}</th>
                  <th className="px-4 py-3">{t("don_col_ref", "Reference")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.results.map((r: DonationRow) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(r.date).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{r.donor}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                      <Chip tone={r.kind === "student" ? "primary" : "muted"}>{r.kind === "student" ? t("don_student", "Student") : t("don_guest", "Guest")}</Chip>
                    </td>
                    <td className="px-4 py-3">{t(`don_fund_${r.fund}`, r.fund_label)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">{money(r.amount, r.currency)}</td>
                    <td className="px-4 py-3"><Chip tone={STATUS_TONE[r.status]}>{t(`don_${r.status.toLowerCase()}`, r.status)}</Chip></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-center text-xs text-muted-foreground">{t("don_n_rows", "{{n}} donation(s)", { n: data.count })}</p>
            <Pagination currentPage={page} totalPages={Math.ceil(data.count / PAGE_SIZE)} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
};

export default DonationsAdminPage;
