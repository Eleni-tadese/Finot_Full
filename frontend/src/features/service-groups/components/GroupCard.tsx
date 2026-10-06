import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowRight, FiClock, FiUsers } from "react-icons/fi";
import type { ServiceGroup } from "../../../types";
import Badge from "../../../components/ui/Badge";
import GroupPhoto from "./GroupPhoto";

/** Card used wherever students browse service groups. Shows what helps them choose. */
export type GroupStatus = "member" | "pending" | "other";

const GroupCard = ({ group, selected, status }: { group: ServiceGroup; selected?: boolean; status?: GroupStatus }) => {
  const { t } = useTranslation();
  const blurb = group.summary || group.description || t("no_description_available");

  return (
    <Link
      to={`/dashboard/service/${group.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated"
    >
      <div className="relative h-40 w-full bg-muted">
        <GroupPhoto photo={group.photo} name={group.name} className="h-full w-full" />
        {status === "member" && <div className="absolute right-3 top-3"><Badge variant="success" size="sm">{t("svc_status_member", "Your group")}</Badge></div>}
        {status === "pending" && <div className="absolute right-3 top-3"><Badge variant="warning" size="sm">{t("svc_status_pending", "Waiting for approval")}</Badge></div>}
        {status === "other" && <div className="absolute right-3 top-3"><Badge variant="default" size="sm">{t("svc_status_other", "Joined another group")}</Badge></div>}
        {!status && selected && (
          <div className="absolute right-3 top-3"><Badge variant="success" size="sm">{t("selected")}</Badge></div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold text-foreground">{group.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{blurb}</p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {group.commitment && (
            <span className="inline-flex items-center gap-1"><FiClock className="h-3.5 w-3.5" />{group.commitment}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <FiUsers className="h-3.5 w-3.5" />{t("group_members_n", "{{n}} member(s)", { n: group.member_count ?? 0 })}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-end pt-4 text-primary">
          <span className="text-sm font-medium">{t("view_details")}</span>
          <FiArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
};

export default GroupCard;
