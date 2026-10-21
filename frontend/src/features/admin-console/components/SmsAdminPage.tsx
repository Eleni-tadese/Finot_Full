import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import Pagination from "../../../components/ui/Pagination";
import { firstApiError } from "../../resources/utils";
import { adminApi, PAGE_SIZE } from "../api";
import type { SmsLogRow, SmsSettings } from "../types";
import { Chip, Empty, Loading, PageHeader, Toggle } from "./AdminUi";
import EmailOutboxPanel from "./EmailOutboxPanel";

const TONES: Record<SmsLogRow["status"], "green" | "red" | "amber"> = {
  SENT: "green", FAILED: "red", LIMIT_REACHED: "amber", INVALID_PHONE: "amber",
};

const SmsAdminPage = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<SmsLogRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [logsLoading, setLogsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const s = await adminApi.smsSettings();
      setSettings(s);
      setLimit(String(s.monthly_limit));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    }
  }, [t]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    setLogsLoading(true);
    adminApi.smsLogs({ status: status || undefined, page })
      .then((d) => { setLogs(d.results); setCount(d.count); })
      .catch(() => toast.error(t("adm_load_failed", "Could not load this page. Please try again.")))
      .finally(() => setLogsLoading(false));
  }, [status, page, t]);

  if (!settings) return <Loading />;

  const save = async (body: Partial<Pick<SmsSettings, "enabled" | "monthly_limit">>) => {
    setSaving(true);
    try {
      const s = await adminApi.updateSmsSettings(body);
      setSettings(s);
      setLimit(String(s.monthly_limit));
      toast.success(t("adm_saved", "Saved."));
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const used = settings.monthly_limit > 0 ? Math.min(100, (settings.sent_this_month * 100) / settings.monthly_limit) : 100;
  const limitChanged = limit !== String(settings.monthly_limit);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title={t("adm_messages_title", "Messages")}
        description={t("adm_messages_desc", "Emails and text messages the system sends to the community.")}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("adm_email_title", "Email")}</h2>
        <EmailOutboxPanel />
      </section>

      <PageHeader
        title={t("adm_sms_title", "SMS")}
        description={t("adm_sms_desc", "Text messages go only to students who opted in: when their private question is answered, when a new event is published, and the weekly donation reminder. Until a real SMS provider is connected, messages are only written to the server log and nothing is sent or charged.")}
      />

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-foreground">{t("adm_sms_switch", "Send SMS")}</p>
            <p className="text-sm text-muted-foreground">{settings.enabled ? t("adm_sms_is_on", "SMS is switched on.") : t("adm_sms_is_off", "SMS is switched off. No message will be sent.")}</p>
          </div>
          <Toggle checked={settings.enabled} disabled={saving} label={t("adm_sms_switch", "Send SMS")} onChange={(v) => save({ enabled: v })} />
        </div>

        <hr className="my-5 border-border" />

        <label className="block text-sm font-medium text-foreground" htmlFor="sms-limit">{t("adm_sms_limit", "Monthly message limit")}</label>
        <p className="mb-2 text-xs text-muted-foreground">{t("adm_sms_limit_hint", "Sending stops by itself when this many messages were sent in the month. Protects your budget.")}</p>
        <div className="flex gap-2">
          <input id="sms-limit" type="number" min={0} max={1000000} value={limit} onChange={(e) => setLimit(e.target.value)} className="input w-40" />
          <button
            onClick={() => save({ monthly_limit: Number(limit) })}
            disabled={saving || !limitChanged || limit === "" || Number.isNaN(Number(limit))}
            className="btn-primary px-4 py-2 text-sm"
          >{t("save")}</button>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t("adm_sms_used", "Used this month")}: {settings.sent_this_month}</span>
            <span>{t("adm_sms_left", "Left")}: {settings.remaining_this_month}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div className={`h-2 rounded-full ${used >= 90 ? "bg-red-600" : used >= 70 ? "bg-yellow-500" : "bg-green-600"}`} style={{ width: `${used}%` }} />
          </div>
        </div>
      </Card>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("adm_sms_log", "Message log")}</h2>
          <select className="input w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t("adm_status")}>
            <option value="">{t("adm_all_statuses", "All statuses")}</option>
            {(["SENT", "FAILED", "LIMIT_REACHED", "INVALID_PHONE"] as const).map((v) => <option key={v} value={v}>{t(`sms_status_${v}`)}</option>)}
          </select>
        </div>

        {logsLoading ? <Loading /> : logs.length === 0 ? (
          <Empty>{t("adm_sms_no_logs", "No messages yet.")}</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("adm_when", "When")}</th>
                  <th className="px-4 py-3">{t("adm_to", "To")}</th>
                  <th className="px-4 py-3">{t("adm_what", "Message")}</th>
                  <th className="px-4 py-3">{t("adm_status", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><p className="text-foreground">{l.user ?? "-"}</p><p className="text-xs text-muted-foreground">{l.phone}</p></td>
                    <td className="px-4 py-3 text-foreground">{t(`sms_trigger_${l.trigger}`, l.trigger)}<p className="text-xs text-muted-foreground">{l.provider}</p></td>
                    <td className="px-4 py-3">
                      <Chip tone={TONES[l.status]}>{t(`sms_status_${l.status}`)}</Chip>
                      {l.error && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{l.error}</p>}
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

export default SmsAdminPage;
