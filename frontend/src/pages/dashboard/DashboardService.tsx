import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import axiosInstance from "../../lib/axios";
import { Card, SectionHeader } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import GroupCard, { GroupStatus } from "../../features/service-groups/components/GroupCard";
import EmptyState from "../../components/ui/EmptyState";
import { useTranslation } from "react-i18next";
import { ServiceGroup } from "../../types";
import { FiBriefcase, FiSettings } from "react-icons/fi";

const DashboardService = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySelection, setMySelection] = useState<any[]>([]);
  const [memberOf, setMemberOf] = useState<{ id: number; name: string }[]>([]);
  const [maxGroups, setMaxGroups] = useState(2);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const groups = await api.getServiceGroups();
        setServiceGroups(groups || []);

        try {
          // The group that accepted me, if any ("ADMIN" means I run a group, which is not the same as joining one)
          const m = await axiosInstance.get("/api/service/groups/my-membership/");
          if (m.data?.role !== "ADMIN" && Array.isArray(m.data?.memberships)) {
            setMemberOf(m.data.memberships.map((x: any) => ({ id: x.service_group_id, name: x.service_group_name })));
            if (m.data.max_groups) setMaxGroups(m.data.max_groups);
          }
        } catch {
          setMemberOf([]);
        }

        try {
          const selections = await api.getUserSelection();
          setMySelection(selections || []);
        } catch (err) {
          console.log("No selections found");
        }
      } catch (error) {
        console.error("Failed to fetch service groups", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  const mySelectionIds = new Set(mySelection.map((s: any) => s.service_group));

  // Where does each choice stand? A group that accepted me is mine; once I hold the maximum, my other choices close.
  const memberIds = new Set(memberOf.map((g) => g.id));
  const atLimit = memberOf.length >= maxGroups;
  const statusOf = (groupId: number): GroupStatus | undefined => {
    if (memberIds.has(groupId)) return "member";
    if (!mySelectionIds.has(groupId)) return undefined;
    return atLimit ? "other" : "pending";
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("service_groups")}
        description={t("join_ministry")}
        icon={<FiBriefcase className="h-6 w-6" />}
        action={
          <Link to="/dashboard/service/select" className="btn-primary inline-flex items-center gap-2 text-sm">
            <FiSettings className="h-4 w-4" />
            {t("manage_preferences")}
          </Link>
        }
      />

      {memberOf.length > 0 && (
        <Card className="border-l-4 border-l-success">
          <h3 className="text-base font-medium text-foreground">{t("svc_my_group", "You are a member of {{name}}", { name: memberOf.map((g) => g.name).join(" + ") })}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {atLimit
              ? t("svc_my_group_full", "You are in {{n}} groups, the most a student can join. Your other choices are closed.", { n: memberOf.length })
              : t("svc_my_group_more", "You can join up to {{n}} groups. Your other choices are still waiting.", { n: maxGroups })}
          </p>
        </Card>
      )}
      {!memberOf.length && mySelection.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("svc_pending_note", "Your choices are waiting. The admin of a group you chose will accept you.")}
        </p>
      )}

      {/* My Selections */}
      {mySelection.length > 0 && (
        <Card className="border-l-4 border-l-accent">
          <h3 className="mb-3 text-base font-medium text-foreground">{t("my_selected_groups")}</h3>
          <div className="flex flex-wrap gap-2">
            {mySelection.map((selection: any) => (
              <Badge
                key={selection.id}
                variant={statusOf(selection.service_group) === "member" ? "success" : statusOf(selection.service_group) === "other" ? "default" : "accent"}
                size="md"
              >
                {selection.service_group_name} ({t("priority")} {selection.priority}) ·{" "}
                {statusOf(selection.service_group) === "member"
                  ? t("svc_status_accepted", "Accepted")
                  : statusOf(selection.service_group) === "other"
                  ? t("svc_status_other", "Joined another group")
                  : t("svc_status_pending", "Waiting for approval")}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Service Groups Grid */}
      {serviceGroups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FiBriefcase className="h-10 w-10" />}
            title={t("no_service_groups")}
            description={t("ministry_opportunities")}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {serviceGroups.map((group) => (
            <GroupCard key={group.id} group={group} selected={mySelectionIds.has(group.id)} status={statusOf(group.id)} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardService;
