import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axiosInstance from "../../../lib/axios";
import ProfileFilterBar, { FilterField } from "../../../components/ui/ProfileFilterBar";
import SearchBar from "../../../components/ui/SearchBar";
import StudentCard from "../../../components/people/StudentCard";
import { useAuth } from "../../../context/AuthContext";
import { hasRole } from "../../auth/roles";
import UserPicker from "../../admin-console/components/UserPicker";
import { Modal } from "../../admin-console/components/AdminUi";
import { firstApiError } from "../../resources/utils";

interface Facts {
  gender: "M" | "F" | null;
  batch_year: number | null;
  department: string;
  dorm_block: number | null;
  section: number | null;
  student_status?: "IN_CAMPUS" | "GRADUATED" | null;
}
interface Applicant extends Facts {
  student_id: number;
  full_name: string;
  email: string;
  priority: number;
  skills: string;
  reason: string;
  current_groups: { id: number; name: string }[];
  at_limit: boolean;
}
interface Member extends Facts {
  student_id: number;
  full_name: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
}

const chip = "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium";

/** Students who chose this group (accept them) and the current members (remove them). */
const GroupMembersPanel = ({ groupId }: { groupId: number }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);
  const { user } = useAuth();
  const isSuperAdmin = hasRole(user, "Super_admin");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/api/service/groups/${groupId}/applicants/`);
      setApplicants(res.data.applicants);
      setMembers(res.data.members);
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => { load(); }, [load]);

  const act = async (kind: "add-member" | "remove-member", studentId: number, okKey: string) => {
    setBusyId(studentId);
    try {
      await axiosInstance.post(`/api/service/groups/${groupId}/${kind}/`, { student_id: studentId });
      toast.success(t(okKey));
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: Member) => {
    if (await confirm(t("mem_confirm_remove", "Remove {{name}} from this group?", { name: m.full_name }))) act("remove-member", m.student_id, "mem_removed");
  };

  // Dropdown choices come from the people on this page, so every choice matches someone.
  const everyone: Facts[] = useMemo(() => [...applicants, ...members], [applicants, members]);
  const distinct = (pick: (f: Facts) => string | number | null | undefined) =>
    Array.from(new Set(everyone.map(pick).filter((v): v is string | number => v !== null && v !== undefined && v !== ""))).sort((a, b) => (a > b ? 1 : -1));

  const fields: FilterField[] = [
    { key: "gender", label: t("flt_gender", "Gender"), options: distinct((f) => f.gender).map((g) => ({ value: String(g), label: g === "M" ? t("flt_male", "Male") : t("flt_female", "Female") })) },
    { key: "student_status", label: t("usr_stage", "Stage"), options: distinct((f) => f.student_status).map((v) => ({ value: String(v), label: v === "GRADUATED" ? t("usr_stage_graduated", "Graduated") : t("usr_stage_student", "Student") })) },
    { key: "batch_year", label: t("flt_batch", "Batch"), options: distinct((f) => f.batch_year).map((b) => ({ value: String(b), label: t("flt_batch_n", "Batch {{n}}", { n: b }) })) },
    { key: "department", label: t("flt_department", "Department"), options: distinct((f) => f.department).map((d) => ({ value: String(d), label: String(d) })) },
    { key: "dorm_block", label: t("flt_dorm", "Dorm block"), options: distinct((f) => f.dorm_block).map((b) => ({ value: String(b), label: t("adm_block_n", "Block {{n}}", { n: b }) })) },
    { key: "section", label: t("flt_section", "Section"), options: distinct((f) => f.section).map((s) => ({ value: String(s), label: t("adm_section_n", "Section {{n}}", { n: s }) })) },
  ].filter((f) => f.options.length > 0);

  const matches = (p: Facts & { full_name: string; email: string }) => {
    const q = search.trim().toLowerCase();
    if (q && !`${p.full_name} ${p.email}`.toLowerCase().includes(q)) return false;
    return Object.entries(filters).every(([key, value]) => !value || String((p as any)[key] ?? "").toLowerCase() === value.toLowerCase());
  };
  const shownApplicants = applicants.filter(matches);
  const shownMembers = members.filter(matches);
  const setFilter = (key: string, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      {isSuperAdmin && (
        <div className="rounded-xl border border-border p-4">
          <UserPicker
            label={t("mem_add_direct", "Add a student to this group")}
            hint={t("mem_add_direct_hint", "A student can be in up to 2 groups. A group's admin must first be one of its members.")}
            value={null}
            onChange={(u) => { if (u) act("add-member", u.id, "mem_accepted"); }}
          />
        </div>
      )}
      {everyone.length > 0 && (
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder={t("adm_search_users", "Search by name or email...")} />
          <ProfileFilterBar fields={fields} values={filters} onChange={setFilter} onClear={() => { setFilters({}); setSearch(""); }} />
        </div>
      )}
      <section>
        <h3 className="text-base font-semibold text-foreground">{t("mem_applicants", "Students who chose this group")} ({shownApplicants.length}{shownApplicants.length !== applicants.length ? ` / ${applicants.length}` : ""})</h3>
        <p className="mb-3 text-sm text-muted-foreground">{t("mem_applicants_hint", "Read what they wrote, then accept the ones you want. A student can be in up to 2 groups.")}</p>
        {shownApplicants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {applicants.length === 0 ? t("mem_no_applicants", "Nobody is waiting.") : t("flt_none", "No one matches these filters.")}
          </p>
        ) : (
          <ul className="space-y-3">
            {shownApplicants.map((a) => (
              <li key={a.student_id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{a.full_name}</span>
                  <span className={`${chip} bg-primary/10 text-primary`}>{t("mem_priority", "Choice {{n}}", { n: a.priority })}</span>
                  {a.gender && <span className={`${chip} bg-muted text-muted-foreground`}>{a.gender === "M" ? t("flt_male", "Male") : t("flt_female", "Female")}</span>}
                  {a.batch_year && <span className={`${chip} bg-muted text-muted-foreground`}>{t("flt_batch_n", "Batch {{n}}", { n: a.batch_year })}</span>}
                  {a.department && <span className={`${chip} bg-muted text-muted-foreground`}>{a.department}</span>}
                  {a.current_groups.length > 0 && (
                    <span className={`${chip} ${a.at_limit ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {a.at_limit
                        ? t("mem_at_limit", "Already in {{names}} (the limit)", { names: a.current_groups.map((g) => g.name).join(" + ") })
                        : t("mem_also_in", "Also in {{names}}", { names: a.current_groups.map((g) => g.name).join(" + ") })}
                    </span>
                  )}
                  <button onClick={() => setViewing(a.student_id)} className="btn-outline ml-auto px-3 py-1.5 text-xs">{t("sp_view", "View")}</button>
                  <button
                    onClick={() => act("add-member", a.student_id, "mem_accepted")}
                    disabled={busyId === a.student_id || a.at_limit}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >{t("mem_accept", "Accept")}</button>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.email}</p>
                {(a.skills || a.reason) && (
                  <dl className="mt-2 space-y-1 text-sm">
                    {a.skills && <div><dt className="inline font-medium text-foreground">{t("mem_skills", "Skills")}: </dt><dd className="inline text-muted-foreground">{a.skills}</dd></div>}
                    {a.reason && <div><dt className="inline font-medium text-foreground">{t("mem_reason", "Why")}: </dt><dd className="inline text-muted-foreground">{a.reason}</dd></div>}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold text-foreground">{t("mem_members", "Members")} ({shownMembers.length}{shownMembers.length !== members.length ? ` / ${members.length}` : ""})</h3>
        {shownMembers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {members.length === 0 ? t("mem_no_members", "No members yet.") : t("flt_none", "No one matches these filters.")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shownMembers.map((m) => (
              <li key={m.student_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[m.gender === "M" ? t("flt_male", "Male") : m.gender === "F" ? t("flt_female", "Female") : "", m.batch_year ? t("flt_batch_n", "Batch {{n}}", { n: m.batch_year }) : "", m.department].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{t("mem_joined", "Joined {{date}}", { date: new Date(m.joined_at).toLocaleDateString() })}</span>
                <button onClick={() => setViewing(m.student_id)} className="text-xs text-primary hover:underline">{t("sp_view", "View")}</button>
                <button onClick={() => remove(m)} disabled={busyId === m.student_id} className="text-xs text-destructive hover:underline">{t("adm_remove", "Remove")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {viewing !== null && (
        <Modal title={t("sp_title", "Student information")} onClose={() => setViewing(null)} wide>
          <StudentCard load={() => axiosInstance.get(`/api/service/groups/${groupId}/students/${viewing}/`).then((r) => r.data)} />
        </Modal>
      )}
    </div>
  );
};

export default GroupMembersPanel;
