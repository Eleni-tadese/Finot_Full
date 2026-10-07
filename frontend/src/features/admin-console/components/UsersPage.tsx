import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Pagination from "../../../components/ui/Pagination";
import SearchBar from "../../../components/ui/SearchBar";
import ProfileFilterBar, { FilterField } from "../../../components/ui/ProfileFilterBar";
import { firstApiError } from "../../resources/utils";
import { adminApi, PAGE_SIZE } from "../api";
import { SPECIALIZATIONS } from "../types";
import type { AdminUser, Department, RoleOption, Specialization, UserFilterOptions } from "../types";
import { eligibilityProblem } from "../eligibility";
import StudentCard from "../../../components/people/StudentCard";
import { slipsHtml, type Credential } from "../slips";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";

const UsersPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<UserFilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [specs, setSpecs] = useState<Specialization[]>([]);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [details, setDetails] = useState<AdminUser | null>(null);
  const [viewing, setViewing] = useState<AdminUser | null>(null);
  const [slip, setSlip] = useState<{ cred: Credential; days: number } | null>(null);
  const [detailsForm, setDetailsForm] = useState({ batch: "", department: "", stage: "IN_CAMPUS" });

  useEffect(() => {
    adminApi.roles().then(setRoles).catch(() => undefined);
    adminApi.userFilterOptions().then(setOptions).catch(() => undefined);
    adminApi.departments().then(setDepartments).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.users({ search: debounced || undefined, role: role || undefined, page, ...filters });
      setUsers(data.results);
      setCount(data.count);
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [debounced, role, filters, page, t]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
    setPage(1);
  };
  const clearFilters = () => { setFilters({}); setRole(""); setPage(1); };

  const filterFields: FilterField[] = [
    { key: "gender", label: t("flt_gender", "Gender"), options: [{ value: "M", label: t("flt_male", "Male") }, { value: "F", label: t("flt_female", "Female") }] },
    { key: "batch", label: t("flt_batch", "Batch"), options: (options?.batches ?? []).map((b) => ({ value: String(b), label: t("flt_batch_n", "Batch {{n}}", { n: b }) })) },
    { key: "department", label: t("flt_department", "Department"), options: (options?.departments ?? []).map((d) => ({ value: d, label: d })) },
    { key: "group", label: t("flt_group", "Service group"), options: [{ value: "none", label: t("flt_no_group", "No group") }, ...(options?.groups ?? []).map((g) => ({ value: String(g.id), label: g.name }))] },
    { key: "family", label: t("flt_family", "Family"), options: [{ value: "has", label: t("flt_has_family", "In a family") }, { value: "none", label: t("flt_no_family", "Not in a family") }] },
    { key: "dorm_block", label: t("flt_dorm", "Dorm block"), options: (options?.dorm_blocks ?? []).map((b) => ({ value: String(b), label: t("adm_block_n", "Block {{n}}", { n: b }) })) },
    { key: "section", label: t("flt_section", "Section"), options: (options?.sections ?? []).map((s) => ({ value: String(s), label: t("adm_section_n", "Section {{n}}", { n: s }) })) },
    { key: "stage", label: t("usr_stage", "Stage"), options: [{ value: "student", label: t("usr_stage_student", "Student") }, { value: "graduated", label: t("usr_stage_graduated", "Graduated") }] },
    { key: "status", label: t("flt_status", "Status"), options: [{ value: "active", label: t("adm_active", "Active") }, { value: "inactive", label: t("adm_inactive", "Inactive") }] },
  ];

  const replaceUser = (updated: AdminUser) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  const roleLabel = (name: string) => t(`role_${name}`, roles.find((r) => r.name === name)?.label ?? name);

  const reissue = async (user: AdminUser) => {
    if (!(await confirm(t("slip_reissue_confirm", "Make a new slip for {{name}}? The old password stops working and the waiting time starts again.", { name: user.full_name })))) return;
    try {
      const res = await adminApi.reissueSlip(user.id);
      setSlip({ cred: { row: 0, name: res.name, email: res.email, password: res.password }, days: res.grace_days });
      load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  const printSlip = () => {
    if (!slip) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error(t("imp_popup", "Allow pop-ups for this site to print the slips.")); return; }
    w.document.write(slipsHtml([slip.cred], slip.days, `${window.location.origin}/login`));
    w.document.close();
  };

  const openEditor = (user: AdminUser) => {
    setEditing(user);
    setSelected(user.roles);
    setSpecs([]);
    if (user.roles.includes("QACounselor")) {
      // an existing counselor: show what they already handle
      adminApi.counselors().then((all) => setSpecs(all.find((c) => c.id === user.id)?.specializations ?? [])).catch(() => undefined);
    }
  };
  const toggleSpec = (s: Specialization) => setSpecs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const openDetails = (user: AdminUser) => {
    setDetails(user);
    setDetailsForm({ batch: user.batch_year ? String(user.batch_year) : "", department: user.department || "", stage: user.student_status || "IN_CAMPUS" });
  };
  const saveDetails = async () => {
    if (!details) return;
    setSaving(true);
    try {
      replaceUser(await adminApi.updateUser(details.id, {
        batch_year: detailsForm.batch ? Number(detailsForm.batch) : null,
        department: detailsForm.department,
        student_status: detailsForm.stage,
      }));
      toast.success(t("adm_saved", "Saved."));
      setDetails(null);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };
  const toggleRole = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]));

  const saveRoles = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      replaceUser(await adminApi.updateUser(editing.id, { roles: selected }));
      if (selected.includes("QACounselor")) await adminApi.setSpecializations(editing.id, specs);
      toast.success(t("adm_roles_saved", "Roles updated."));
      setEditing(null);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: AdminUser) => {
    const message = user.is_active
      ? t("adm_confirm_deactivate", "Deactivate {{name}}? They will not be able to log in.", { name: user.full_name })
      : t("adm_confirm_activate", "Activate {{name}}?", { name: user.full_name });
    if (!(await confirm({ message, danger: user.is_active }))) return;
    try {
      replaceUser(await adminApi.updateUser(user.id, { is_active: !user.is_active }));
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("adm_users_title", "Users & roles")}
        description={t("adm_users_desc", "Find people, give or remove roles, and switch accounts on or off. Role changes take effect the next time that person logs in.")}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder={t("adm_search_users", "Search by name or email...")} /></div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="input sm:w-56" aria-label={t("adm_filter_role", "Filter by role")}>
          <option value="">{t("adm_all_roles", "All roles")}</option>
          {roles.map((r) => <option key={r.name} value={r.name}>{roleLabel(r.name)}</option>)}
        </select>
      </div>

      <div className="mb-4">
        <ProfileFilterBar fields={filterFields} values={filters} onChange={setFilter} onClear={clearFilters} />
      </div>

      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <Empty>{t("adm_no_users", "No users match your search.")}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("adm_name", "Name")}</th>
                <th className="px-4 py-3">{t("adm_roles", "Roles")}</th>
                <th className="px-4 py-3">{t("adm_status", "Status")}</th>
                <th className="px-4 py-3 text-right">{t("adm_actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.gender && <Chip>{u.gender === "M" ? t("flt_male", "Male") : t("flt_female", "Female")}</Chip>}
                      {u.batch_year && <Chip>{t("flt_batch_n", "Batch {{n}}", { n: u.batch_year })}</Chip>}
                      {u.department && <Chip>{u.department}</Chip>}
                      {u.student_status === "GRADUATED" && <Chip tone="green">{t("usr_stage_graduated", "Graduated")}</Chip>}
                      {u.service_group && <Chip tone="primary">{u.service_group}</Chip>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 ? <span className="text-xs text-muted-foreground">{t("adm_no_roles", "Student (default)")}</span> : u.roles.map((r) => <Chip key={r} tone="primary">{roleLabel(r)}</Chip>)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active ? <Chip tone="green">{t("adm_active", "Active")}</Chip> : <Chip tone="red">{t("adm_inactive", "Inactive")}</Chip>}
                    {u.setup?.pending && (
                      <div className="mt-1"><Chip tone={u.setup.required ? "red" : "amber"}>{u.setup.required ? t("slip_expired", "Slip expired") : t("slip_days", "Slip: {{n}} days left", { n: u.setup.days_left })}</Chip></div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setViewing(u)} className="btn-outline px-3 py-1.5 text-xs">{t("sp_view", "View")}</button>
                      <button onClick={() => openDetails(u)} className="btn-outline px-3 py-1.5 text-xs">{t("usr_edit_details", "Edit details")}</button>
                      <button onClick={() => openEditor(u)} className="btn-outline px-3 py-1.5 text-xs">{t("adm_edit_roles", "Edit roles")}</button>
                      {u.setup?.pending && <button onClick={() => reissue(u)} className="btn-outline px-3 py-1.5 text-xs">{t("slip_reissue", "New slip")}</button>}
                      <button onClick={() => toggleActive(u)} className="btn-outline px-3 py-1.5 text-xs">
                        {u.is_active ? t("adm_deactivate", "Deactivate") : t("adm_activate", "Activate")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-center text-xs text-muted-foreground">{t("adm_n_users", "{{n}} user(s)", { n: count })}</p>
        <Pagination currentPage={page} totalPages={Math.ceil(count / PAGE_SIZE)} onPageChange={setPage} />
      </div>

      {editing && (
        <Modal
          title={t("adm_roles_of", "Roles of {{name}}", { name: editing.full_name })}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button onClick={() => setEditing(null)} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
              <button onClick={saveRoles} disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? t("saving") : t("save")}</button>
            </>
          }
        >
          <div className="space-y-2">
            {roles.map((r) => {
              const viaGroup = Boolean(r.via_group) && !editing.roles.includes(r.name);
              const problem = editing.roles.includes(r.name) ? null : eligibilityProblem(editing, r.min_year);
              const blocked = viaGroup || !!problem;
              return (
                <label key={r.name} className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${blocked ? "opacity-60" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={selected.includes(r.name)} disabled={blocked} onChange={() => toggleRole(r.name)} className="h-4 w-4" />
                  <span className="flex-1 text-sm text-foreground">{roleLabel(r.name)}</span>
                  {viaGroup && <span className="text-xs text-muted-foreground">{t("usr_via_group", "Given by making them a group's admin (Service groups)")}</span>}
                  {!viaGroup && r.min_year && <span className="text-xs text-muted-foreground">{problem === "no_year" ? t("usr_no_year", "Set the year first") : t("usr_need_year", "Year {{n}}+ or graduate", { n: r.min_year })}</span>}
                </label>
              );
            })}
          </div>
          {selected.includes("QACounselor") && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-medium text-foreground">{t("usr_spec_title", "What does this counselor answer?")}</p>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                {t("usr_spec_hint", "Academic questions go to Academic teachers, Spiritual to Soul teachers, Personal to Psychotherapists (and only after you assign them). Family and Other questions can be seen by any counselor.")}
              </p>
              <div className="space-y-1.5">
                {SPECIALIZATIONS.map((s) => (
                  <label key={s.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <input type="checkbox" className="h-4 w-4" checked={specs.includes(s.value)} onChange={() => toggleSpec(s.value)} />
                    <span className="flex-1 text-sm text-foreground">{t(`specialization_${s.value}`, s.label)}</span>
                    <span className="text-xs text-muted-foreground">{t(`usr_spec_cat_${s.value}`, "")}</span>
                  </label>
                ))}
              </div>
              {specs.length === 0 && <p className="mt-2 text-xs text-amber-700">{t("usr_spec_none", "Nothing ticked: this counselor will only see Family and Other questions, and the ones you assign.")}</p>}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t("adm_roles_hint", "A person can have several roles. Super Admin gives full access, so give it with care.")}
          </p>
        </Modal>
      )}
      {slip && (
        <Modal
          title={t("slip_title", "New slip for {{name}}", { name: slip.cred.name })}
          onClose={() => setSlip(null)}
          footer={
            <>
              <button onClick={() => setSlip(null)} className="btn-outline px-4 py-2 text-sm">{t("close")}</button>
              <button onClick={printSlip} className="btn-primary px-4 py-2 text-sm">{t("slip_print", "Print the slip")}</button>
            </>
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">{t("slip_shown_once", "The password is shown only now. Print the slip or write it down before you close this window.")}</p>
          <div className="space-y-1 rounded-xl bg-muted/50 p-4 text-sm">
            <p><span className="text-muted-foreground">{t("email", "Email")}:</span> <code className="font-semibold text-foreground">{slip.cred.email}</code></p>
            <p><span className="text-muted-foreground">{t("password", "Password")}:</span> <code className="text-lg font-bold tracking-wider text-foreground">{slip.cred.password}</code></p>
            <p className="text-xs text-muted-foreground">{t("slip_valid_days", "It works for {{n}} days.", { n: slip.days })}</p>
          </div>
        </Modal>
      )}
      {viewing && (
        <Modal title={t("sp_title", "Student information")} onClose={() => setViewing(null)} wide>
          <StudentCard load={() => adminApi.userCard(viewing.id)} />
        </Modal>
      )}

      {details && (
        <Modal
          title={t("usr_details_title", "Details of {{name}}", { name: details.full_name })}
          onClose={() => setDetails(null)}
          footer={
            <>
              <button onClick={() => setDetails(null)} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
              <button onClick={saveDetails} disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? t("saving") : t("save")}</button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium">{t("usr_year", "Year of study")}
              <select className="input mt-1 w-full" value={detailsForm.batch} onChange={(e) => setDetailsForm({ ...detailsForm, batch: e.target.value })}>
                <option value="">{t("usr_not_set", "Not set")}</option>
                {[1, 2, 3, 4, 5, 6, 7].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">{t("usr_department", "Department")}
              {departments.some((d) => d.is_active) ? (
                <select className="input mt-1 w-full" value={detailsForm.department} onChange={(e) => setDetailsForm({ ...detailsForm, department: e.target.value })}>
                  <option value="">{t("usr_not_set", "Not set")}</option>
                  {departments.filter((d) => d.is_active || d.name === detailsForm.department).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              ) : (
                <input className="input mt-1 w-full" value={detailsForm.department} onChange={(e) => setDetailsForm({ ...detailsForm, department: e.target.value })} />
              )}
            </label>
            <label className="block text-sm font-medium">{t("usr_stage", "Stage")}
              <select className="input mt-1 w-full" value={detailsForm.stage} onChange={(e) => setDetailsForm({ ...detailsForm, stage: e.target.value })}>
                <option value="IN_CAMPUS">{t("usr_stage_student", "Student")}</option>
                <option value="GRADUATED">{t("usr_stage_graduated", "Graduated")}</option>
              </select>
            </label>
            <p className="text-xs text-muted-foreground">{t("usr_details_hint", "Only the Super Admin can change these after sign-up. The yearly rollover moves the year for everyone.")}</p>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default UsersPage;
