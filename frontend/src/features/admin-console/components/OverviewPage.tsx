import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Card } from "../../../components/ui/Card";
import { adminApi } from "../api";
import type { Overview } from "../types";
import { Loading, PageHeader } from "./AdminUi";

const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <Card padding="md">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </Card>
);

const Attention = ({ to, children }: { to: string; children: string }) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100"
  >
    <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
    <span>{children}</span>
  </Link>
);

const OverviewPage = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    adminApi.overview().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="py-16 text-center text-muted-foreground">{t("adm_load_failed", "Could not load this page. Please try again.")}</p>;
  if (!data) return <Loading />;

  const todo: { to: string; text: string }[] = [];
  if (data.qa.needs_assignment > 0)
    todo.push({ to: "/dashboard/admin/qa", text: t("adm_todo_assign", "{{n}} private question(s) need a counselor assigned.", { n: data.qa.needs_assignment }) });
  if (data.qa.public_pending > 0)
    todo.push({ to: "/dashboard/admin/qa", text: t("adm_todo_pending", "{{n}} public question(s) are waiting for a moderator.", { n: data.qa.public_pending }) });
  if (data.donations && data.donations.pending > 0)
    todo.push({ to: "/dashboard/admin/donations", text: t("adm_todo_donations", "{{n}} donation(s) are pending: the donor started paying but it is not confirmed yet.", { n: data.donations.pending }) });
  if (data.families.unassigned_freshers > 0)
    todo.push({ to: "/dashboard/admin/families", text: t("adm_todo_freshers", "{{n}} first-year student(s) are not in a family yet.", { n: data.families.unassigned_freshers }) });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("adm_overview_title", "Admin overview")} description={t("adm_overview_desc", "A quick look at the whole platform and what needs your attention.")} />

      {todo.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("adm_needs_attention", "Needs your attention")}</h2>
          {todo.map((x) => <Attention key={x.text} to={x.to}>{x.text}</Attention>)}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("adm_users_real", "Real accounts")} value={data.users.real} hint={t("adm_active_n", "{{n}} active", { n: data.users.real_active })} />
        <Stat
          label={t("adm_slips", "Login slips")}
          value={data.users.slips_used + data.users.slips_unused}
          hint={t("adm_slips_hint", "{{u}} signed in, {{n}} never used", { u: data.users.slips_used, n: data.users.slips_unused })}
        />
        <Stat
          label={t("adm_students", "Student profiles")}
          value={data.users.students_real}
          hint={t("adm_on_slip_n", "{{n}} still on a slip", { n: data.users.students - data.users.students_real })}
        />
        <Stat label={t("adm_families", "Families")} value={data.families.total} />
        <Stat label={t("adm_upcoming_events", "Upcoming events")} value={data.events.upcoming} hint={t("adm_of_total", "of {{n}} total", { n: data.events.total })} />
        <Stat label={t("adm_private_q", "Private questions")} value={data.qa.private_total} hint={t("adm_unanswered_n", "{{n}} unanswered", { n: data.qa.private_unanswered })} />
        <Stat label={t("adm_public_pending", "Public questions to review")} value={data.qa.public_pending} />
        {data.donations && (
          <Stat
            label={t("adm_donations", "Donations collected")}
            value={`${Number(data.donations.collected).toLocaleString(undefined, { maximumFractionDigits: 2 })} ETB`}
            hint={t("adm_donations_hint", "{{n}} confirmed, {{p}} pending", { n: data.donations.completed, p: data.donations.pending })}
          />
        )}
        <Stat
          label={t("adm_sms", "SMS this month")}
          value={`${data.sms.sent_this_month} / ${data.sms.monthly_limit}`}
          hint={data.sms.enabled ? t("adm_sms_on", "Switched on") : t("adm_sms_off", "Switched off")}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-foreground">{t("adm_users_by_role", "Users by role")}</h2>
      <Card>
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {Object.entries(data.users.by_role).map(([role, n]) => (
            <li key={role} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t(`role_${role}`, role)}</span>
              <span className="font-medium text-foreground">{n}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default OverviewPage;
