import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiBookOpen, FiBriefcase, FiCalendar, FiCheckCircle, FiMessageCircle, FiShield, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import SearchBar from "../../../components/ui/SearchBar";
import axiosInstance from "../../../lib/axios";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { AdminUser, ServiceGroupRow, SubAdminRole } from "../types";
import { eligibilityProblem } from "../eligibility";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";

// Colour and icon for each role, so the cards are easy to tell apart at a glance.
const ROLE_STYLE: Record<string, { icon: React.ElementType; bar: string; tint: string }> = {
  SuperAdmin: { icon: FiShield, bar: "bg-primary", tint: "bg-primary/10 text-primary" },
  ServiceAdmin: { icon: FiBriefcase, bar: "bg-blue-500", tint: "bg-blue-50 text-blue-700" },
  FamilyAdmin: { icon: FiUsers, bar: "bg-emerald-500", tint: "bg-emerald-50 text-emerald-700" },
  EventManager: { icon: FiCalendar, bar: "bg-amber-500", tint: "bg-amber-50 text-amber-700" },
  CourseCoordinator: { icon: FiBookOpen, bar: "bg-violet-500", tint: "bg-violet-50 text-violet-700" },
  QACounselor: { icon: FiMessageCircle, bar: "bg-teal-500", tint: "bg-teal-50 text-teal-700" },
  QAModerator: { icon: FiCheckCircle, bar: "bg-rose-500", tint: "bg-rose-50 text-rose-700" },
};
const ROLE_ORDER = ["SuperAdmin", "ServiceAdmin", "FamilyAdmin", "EventManager", "CourseCoordinator", "QACounselor", "QAModerator"];
const FALLBACK_STYLE = { icon: FiShield, bar: "bg-slate-400", tint: "bg-slate-100 text-slate-700" };

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
    <p className="text-3xl font-bold text-primary">{value}</p>
    <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
  </div>
);

const SubAdminsPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<SubAdminRole[]>([]);
  const [groups, setGroups] = useState<ServiceGroupRow[]>([]);
  const [members, setMembers] = useState<Record<number, { id: number; name: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<SubAdminRole | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([adminApi.subAdmins(), adminApi.serviceGroups()]);
      setRoles([...r].sort((a, b) => ROLE_ORDER.indexOf(a.name) - ROLE_ORDER.indexOf(b.name)));
      setGroups(g);
      const entries = await Promise.all(
        g.map(async (grp) => [grp.id, await axiosInstance.get(`/api/service/groups/${grp.id}/members/`).then((res) => res.data).catch(() => [])] as const),
      );
      setMembers(Object.fromEntries(entries));
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // People who hold more than one admin role, so the page can say so
  const roleCount = useMemo(() => {
    const counts: Record<number, number> = {};
    roles.forEach((r) => r.members.forEach((m) => { counts[m.id] = (counts[m.id] ?? 0) + 1; }));
    return counts;
  }, [roles]);

  useEffect(() => {
    if (!adding || search.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      adminApi.users({ search: search.trim() })
        .then((d) => setResults(d.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, adding]);

  const closeAdd = () => { setAdding(null); setSearch(""); setResults([]); };

  const addRole = async (user: AdminUser) => {
    if (!adding) return;
    try {
      await adminApi.updateUser(user.id, { add_role: adding.name });
      toast.success(t("adm_added_to_role", "{{name}} is now {{role}}.", { name: user.full_name, role: t(`role_${adding.name}`, adding.label) }));
      closeAdd();
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  const removeRole = async (role: SubAdminRole, member: { id: number; full_name: string }) => {
    if (!(await confirm(t("adm_confirm_remove_role", "Remove {{name}} from {{role}}?", { name: member.full_name, role: t(`role_${role.name}`, role.label) })))) return;
    try {
      await adminApi.updateUser(member.id, { remove_role: role.name });
      toast.success(t("adm_removed", "Removed."));
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  const setGroupAdmin = async (group: ServiceGroupRow, value: string) => {
    try {
      await adminApi.setGroupAdmin(group.id, value ? Number(value) : null);
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  if (loading) return <Loading />;

  const totalPeople = Object.keys(roleCount).length;
  const rolesInUse = roles.filter((r) => r.members.length > 0).length;
  const groupsWithoutAdmin = groups.filter((g) => !g.admin).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("adm_sub_title", "Sub-admins")}
        description={t("adm_sub_desc", "Everyone who helps run the platform, grouped by what they do. One person can hold several roles; they then see all the matching menus. Give or take away a role here, or in Users & roles.")}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={t("sub_stat_people", "People with an admin role")} value={totalPeople} />
        <Stat label={t("sub_stat_roles", "Roles in use")} value={rolesInUse} />
        <Stat label={t("sub_stat_groups", "Service groups without an admin")} value={groupsWithoutAdmin} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {roles.map((role) => {
          const style = ROLE_STYLE[role.name] ?? FALLBACK_STYLE;
          const Icon = style.icon;
          return (
            <section
              key={role.name}
              className={`overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-shadow hover:shadow-lg ${role.name === "ServiceAdmin" ? "md:col-span-2" : ""}`}
            >
              <div className={`h-1.5 ${style.bar}`} />
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.tint}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-2 font-semibold text-foreground">
                      {t(`role_${role.name}`, role.label)}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.tint}`}>{role.members.length}</span>
                    </h2>
                    <p className="text-sm text-muted-foreground">{t(`role_desc_${role.name}`, role.description)}</p>
                  </div>
                  {role.name === "ServiceAdmin" ? (
                    <span className="shrink-0 rounded-xl bg-muted px-3 py-1.5 text-xs text-muted-foreground">{t("sub_via_group", "Made through a group")}</span>
                  ) : (
                    <button
                      onClick={() => setAdding(role)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <FiUserPlus className="h-4 w-4" />
                      {t("adm_add_person", "Add a person")}
                    </button>
                  )}
                </div>

                {role.members.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                    {t("adm_nobody_yet", "Nobody yet.")}
                  </div>
                ) : (
                  <ul className={`mt-4 grid gap-2 ${role.name === "ServiceAdmin" ? "sm:grid-cols-2 lg:grid-cols-3" : ""}`}>
                    {role.members.map((m) => (
                      <li key={m.id} className="group flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 transition hover:bg-muted">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.tint}`}>
                          {initials(m.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{m.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                          <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
                            {m.detail && <Chip>{m.detail}</Chip>}
                            {roleCount[m.id] > 1 && <Chip tone="primary">{t("adm_n_roles", "{{n}} admin roles", { n: roleCount[m.id] })}</Chip>}
                            {!m.is_active && <Chip tone="red">{t("adm_inactive", "Inactive")}</Chip>}
                          </div>
                        </div>
                        <button
                          onClick={() => removeRole(role, m)}
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`${t("adm_remove", "Remove")} ${m.full_name}`}
                          title={t("adm_remove", "Remove")}
                        >
                          <FiX className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {role.name === "ServiceAdmin" && (
                  <div className="mt-5 rounded-xl bg-muted/40 p-4">
                    <h3 className="text-sm font-semibold text-foreground">{t("adm_group_admins", "Who runs which service group")}</h3>
                    <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{t("adm_group_admins_hint", "One person runs one group. Pick from the Service Admins above; add the person there first if they are not listed.")}</p>
                    {groups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("adm_no_groups", "No service groups exist yet.")}</p>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2">
                        {groups.map((g) => {
                          const takenElsewhere = new Set(groups.filter((x) => x.id !== g.id && x.admin).map((x) => x.admin!.id));
                          return (
                            <div key={g.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                              <FiBriefcase className="h-4 w-4 shrink-0 text-blue-600" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{g.name}</span>
                              <select className="input w-52 py-1.5 text-sm" value={g.admin?.id ?? ""} onChange={(e) => setGroupAdmin(g, e.target.value)} aria-label={g.name}>
                                <option value="">{t("adm_no_admin", "No admin")}</option>
                                {g.admin && !(members[g.id] ?? []).some((m) => m.id === g.admin!.id) && <option value={g.admin.id}>{g.admin.full_name}</option>}
                                {(members[g.id] ?? []).filter((m) => !takenElsewhere.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {adding && (
        <Modal title={t("adm_add_to_role", "Add someone as {{role}}", { role: t(`role_${adding.name}`, adding.label) })} onClose={closeAdd}>
          <SearchBar value={search} onChange={setSearch} placeholder={t("adm_search_users", "Search by name or email...")} />
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {search.trim().length < 2 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("adm_type_two", "Type at least 2 letters.")}</p>
            ) : searching ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("adm_working", "Working...")}</p>
            ) : results.length === 0 ? (
              <Empty>{t("adm_no_users", "No users match your search.")}</Empty>
            ) : (
              results.map((u) => {
                const already = u.roles.includes(adding.name);
                const problem = already ? null : eligibilityProblem(u, adding.min_year);
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{u.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {already ? <Chip tone="green">{t("adm_already", "Already")}</Chip>
                      : problem ? <Chip tone="amber">{problem === "no_year" ? t("usr_no_year", "Set the year first") : t("usr_need_year", "Year {{n}}+ or graduate", { n: adding.min_year })}</Chip>
                      : <button onClick={() => addRole(u)} className="btn-primary px-3 py-1 text-xs">{t("adm_add", "Add")}</button>}
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SubAdminsPage;
