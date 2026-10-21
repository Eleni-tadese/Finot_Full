import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import Pagination from "../../../components/ui/Pagination";
import { firstApiError } from "../../resources/utils";
import { adminApi, PAGE_SIZE } from "../api";
import type { EmailOutboxRow, EmailSettings } from "../types";
import { Chip, Empty, Loading } from "./AdminUi";

const TONES: Record<EmailOutboxRow["status"], "green" | "red" | "amber" | "muted"> = {
  WAITING: "amber", SENT: "green", FAILED: "red", SKIPPED: "muted",
};

/**
 * Super Admin > Messages > Email: the daily limit, today's usage, the queue counts, Send now / Retry failed,
 * and the outbox rows (one per email) with a status filter. The backend is notifications/outbox.py.
 */
const EmailOutboxPanel = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<EmailOutboxRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [rowsLoading, setRowsLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  const loadSettings = useCallback(async () => {
    try {
      const s = await adminApi.emailSettings();
      setSettings(s);
      setLimit(String(s.daily_limit));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);

  useEffect(() => { loadSettings(); }, [loadSettings, refresh]);

  useEffect(() => {
    setRowsLoading(true);
    adminApi.emailOutbox({ status: status || undefined, page })
      .then((d) => { setRows(d.results); setCount(d.count); })
      .catch(() => toast.error(t("adm_load_failed", "Could not load this page. Please try again.")))
      .finally(() => setRowsLoading(false));
  }, [status, page, refresh, t]);

  if (!settings) return <Loading />;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setRefresh((n) => n + 1);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  const saveLimit = () => run(async () => {
    await adminApi.updateEmailSettings({ daily_limit: Number(limit) });
    toast.success(t("adm_saved", "Saved."));
  });
  const sendNow = () => run(async () => {
    await adminApi.sendEmailsNow();
    toast.success(t("adm_email_send_started", "Sending started. Refresh this page in a minute."));
  });
  const retryFailed = () => run(async () => {
    const r = await adminApi.retryFailedEmails();
    toast.success(t("adm_email_retried", "{{n}} email(s) are back in the queue.", { n: r.retried }));
  });

  const used = settings.daily_limit > 0 ? Math.min(100, (settings.sent_today * 100) / settings.daily_limit) : 100;
  const limitChanged = limit !== String(settings.daily_limit);

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm text-muted-foreground">
          {t("adm_email_desc", "Event announcements and \"event tomorrow\" reminders wait in an outbox and go out in daily portions, nearest event first. The free email plan allows about 300 a day.")}
        </p>

        <hr className="my-5 border-border" />

        <label className="block text-sm font-medium text-foreground" htmlFor="email-limit">{t("adm_email_limit", "Daily email limit")}</label>
        <p className="mb-2 text-xs text-muted-foreground">{t("adm_email_limit_hint", "At most this many emails go out per day. Emails over the limit wait for the next day.")}</p>
        <div className="flex gap-2">
          <input id="email-limit" type="number" min={0} max={100000} value={limit} onChange={(e) => setLimit(e.target.value)} className="input w-40" />
          <button
            onClick={saveLimit}
            disabled={busy || !limitChanged || limit === "" || Number.isNaN(Number(limit))}
            className="btn-primary px-4 py-2 text-sm"
          >{t("save")}</button>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t("adm_email_used", "Sent today")}: {settings.sent_today}</span>
            <span>{t("adm_email_left", "Left today")}: {settings.remaining_today}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div className={`h-2 rounded-full ${used >= 90 ? "bg-red-600" : used >= 70 ? "bg-yellow-500" : "bg-green-600"}`} style={{ width: `${used}%` }} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip tone="amber">{t("adm_email_waiting", "Waiting")}: {settings.waiting}</Chip>
          <Chip tone="red">{t("adm_email_failed", "Failed")}: {settings.failed}</Chip>
          <Chip tone="muted">{t("adm_email_skipped", "Skipped")}: {settings.skipped}</Chip>
          <Chip tone="green">{t("adm_email_sent", "Sent")}: {settings.sent}</Chip>
          <span className="flex-1" />
          <button onClick={retryFailed} disabled={busy || settings.failed === 0} className="btn-outline px-4 py-2 text-sm">
            {t("adm_email_retry", "Retry failed")}
          </button>
          <button onClick={sendNow} disabled={busy || settings.waiting === 0 || settings.remaining_today === 0} className="btn-primary px-4 py-2 text-sm">
            {t("adm_email_send_now", "Send now")}
          </button>
        </div>
      </Card>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">{t("adm_email_outbox", "Email outbox")}</h3>
          <select className="input w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t("adm_status")}>
            <option value="">{t("adm_all_statuses", "All statuses")}</option>
            {(["WAITING", "SENT", "FAILED", "SKIPPED"] as const).map((v) => <option key={v} value={v}>{t(`email_status_${v}`)}</option>)}
          </select>
        </div>

        {rowsLoading ? <Loading /> : rows.length === 0 ? (
          <Empty>{t("adm_email_no_rows", "No emails yet.")}</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("adm_when", "When")}</th>
                  <th className="px-4 py-3">{t("adm_to", "To")}</th>
                  <th className="px-4 py-3">{t("adm_email_col", "Email")}</th>
                  <th className="px-4 py-3">{t("adm_status", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                      {r.sent_at && <p className="text-xs">{t("adm_email_sent", "Sent")}: {new Date(r.sent_at).toLocaleString()}</p>}
                    </td>
                    <td className="px-4 py-3"><p className="text-foreground">{r.user ?? "-"}</p><p className="text-xs text-muted-foreground">{r.email}</p></td>
                    <td className="px-4 py-3 text-foreground">
                      {r.subject}
                      <p className="text-xs text-muted-foreground">{t(`email_kind_${r.kind}`, r.kind)}{r.event ? ` · ${r.event}` : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={TONES[r.status]}>{t(`email_status_${r.status}`)}</Chip>
                      {r.attempts > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("adm_email_attempts", "{{n}} attempt(s)", { n: r.attempts })}</p>}
                      {r.error && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{r.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4"><Pagination currentPage={page} totalPages={Math.ceil(count / PAGE_SIZE)} onPageChange={setPage} /></div>
      </section>
    </div>
  );
};

export default EmailOutboxPanel;
