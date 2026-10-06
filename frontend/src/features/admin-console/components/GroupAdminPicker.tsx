import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axiosInstance from "../../../lib/axios";
import type { PickedUser } from "./UserPicker";

interface Member { id: number; name: string; email: string }

/**
 * Choose a group's admin from the people who already belong to that group.
 * A new group has no members yet, so it cannot have an admin until students are accepted into it.
 */
const GroupAdminPicker = ({
  groupId, value, onChange,
}: { groupId: number | null; value: PickedUser | null; onChange: (u: PickedUser | null) => void }) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    if (!groupId) { setMembers([]); return; }
    axiosInstance.get(`/api/service/groups/${groupId}/members/`).then((r) => setMembers(r.data)).catch(() => setMembers([]));
  }, [groupId]);

  const label = t("grp_admin_label", "Group admin (Service Admin)");

  if (!groupId) {
    return (
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
          {t("grp_admin_new_hint", "Create the group first. Then accept students into it (Members) and choose its admin here. Only a member of the group can run it.")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("grp_admin_pick_hint", "Only members of this group can run it. Accept students into the group first (Members).")}</p>
      <select
        className="input mt-1 w-full"
        value={value?.id ?? ""}
        disabled={members === null}
        onChange={(e) => {
          const picked = members?.find((m) => String(m.id) === e.target.value);
          onChange(picked ? { id: picked.id, full_name: picked.name, email: picked.email } : null);
        }}
      >
        <option value="">{t("adm_no_admin", "No admin")}</option>
        {value && !members?.some((m) => m.id === value.id) && <option value={value.id}>{value.full_name}</option>}
        {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {members !== null && members.length === 0 && (
        <p className="mt-1 text-xs text-amber-700">{t("grp_admin_no_members", "This group has no members yet. Accept students into it first.")}</p>
      )}
    </div>
  );
};

export default GroupAdminPicker;
