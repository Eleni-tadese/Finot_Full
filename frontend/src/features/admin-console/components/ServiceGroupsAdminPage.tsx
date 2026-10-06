import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiUser, FiUsers } from "react-icons/fi";
import { Card } from "../../../components/ui/Card";
import GroupForm, { emptyGroupValues } from "../../service-groups/components/GroupForm";
import GroupPhoto from "../../service-groups/components/GroupPhoto";
import GroupMembersPanel from "../../service-groups/components/GroupMembersPanel";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import type { AdminGroup } from "../types";
import { Chip, Empty, Loading, Modal, PageHeader, Toggle } from "./AdminUi";
import type { PickedUser } from "./UserPicker";
import GroupAdminPicker from "./GroupAdminPicker";

/** What a student needs to see before choosing; the list tells the admin what is still missing. */
const missingParts = (g: AdminGroup): string[] => {
  const missing: string[] = [];
  if (!g.photo) missing.push("photo");
  if (!g.summary) missing.push("summary");
  if (!g.description) missing.push("about");
  if (!g.activities) missing.push("activities");
  if (!g.requirements) missing.push("requirements");
  if (!g.commitment) missing.push("commitment");
  if (!g.contact_info) missing.push("contact");
  return missing;
};

const ServiceGroupsAdminPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminGroup | "new" | null>(null);
  const [admin, setAdmin] = useState<PickedUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [membersOf, setMembersOf] = useState<AdminGroup | null>(null);
  const [selectionOpen, setSelectionOpen] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await adminApi.serviceGroups());
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { adminApi.selectionWindow().then((r) => setSelectionOpen(r.is_selection_open)).catch(() => setSelectionOpen(null)); }, []);

  const changeSelection = async (value: boolean) => {
    try {
      setSelectionOpen((await adminApi.setSelectionWindow(value)).is_selection_open);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  const open = (target: AdminGroup | "new") => {
    setEditing(target);
    setAdmin(target !== "new" && target.admin ? { id: target.admin.id, full_name: target.admin.full_name, email: target.admin.email } : null);
  };

  const save = async (data: FormData) => {
    setSaving(true);
    // a brand-new group has no members yet, so there is no admin to send
    if (editing !== "new") data.append("admin_id", admin ? String(admin.id) : "");
    try {
      if (editing === "new") await adminApi.createGroup(data);
      else if (editing) await adminApi.updateGroup(editing.id, data);
      toast.success(editing === "new" ? t("grp_created", "Group created.") : t("grp_saved_short", "Group saved."));
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g: AdminGroup) => {
    if (!(await confirm(t("grp_confirm_delete", "Delete the group \"{{name}}\"? This cannot be undone.", { name: g.name })))) return;
    try {
      await adminApi.deleteGroup(g.id);
      toast.success(t("grp_deleted", "Group deleted."));
      await load();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t("grp_admin_title", "Service groups")}
        description={t("grp_admin_desc", "Create the groups students can join and choose who runs each one. Each group's admin then fills in the information that helps students choose, or you can do it here.")}
        actions={<button onClick={() => open("new")} className="btn-primary px-4 py-2 text-sm">{t("grp_new", "New group")}</button>}
      />

      {selectionOpen !== null && (
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">{t("grp_selection_label", "Students can choose their groups now")}</p>
              <p className="text-sm text-muted-foreground">
                {selectionOpen
                  ? t("grp_selection_on", "Selection is open. Students can submit their three choices.")
                  : t("grp_selection_off", "Selection is closed. Students can read about the groups but cannot submit choices.")}
              </p>
            </div>
            <Toggle checked={selectionOpen} onChange={changeSelection} label={t("grp_selection_title", "Group selection")} />
          </div>
        </Card>
      )}

      {groups.length === 0 ? (
        <Empty>{t("grp_none", "No service groups yet. Create the first one.")}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const missing = missingParts(g);
            return (
              <Card key={g.id} padding="none" className="flex overflow-hidden">
                <GroupPhoto photo={g.photo} name={g.name} className="h-auto w-28 shrink-0 sm:w-36" />
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <h2 className="truncate font-semibold text-foreground">{g.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{g.summary || g.description || t("grp_no_text", "No text yet")}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FiUser className="h-3.5 w-3.5" />
                      {g.admin ? g.admin.full_name : <span className="text-amber-700">{t("grp_no_admin", "No admin yet")}</span>}
                    </span>
                    <span className="inline-flex items-center gap-1"><FiUsers className="h-3.5 w-3.5" />{g.member_count ?? 0}</span>
                  </div>

                  <div className="mt-2">
                    {missing.length === 0 ? (
                      <Chip tone="green">{t("grp_complete", "Information complete")}</Chip>
                    ) : (
                      <Chip tone="amber">{t("grp_missing", "Missing: {{list}}", { list: missing.map((m) => t(`grp_part_${m}`)).join(", ") })}</Chip>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2 pt-3">
                    <button onClick={() => open(g)} className="btn-outline px-3 py-1.5 text-xs">{t("grp_edit", "Edit")}</button>
                    <button onClick={() => setMembersOf(g)} className="btn-outline px-3 py-1.5 text-xs">{t("grp_members_btn", "Members")}</button>
                    <button onClick={() => remove(g)} className="px-3 py-1.5 text-xs text-destructive hover:underline">{t("grp_delete", "Delete")}</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {membersOf && (
        <Modal title={`${membersOf.name} - ${t("grp_tab_members", "Members")}`} onClose={() => { setMembersOf(null); load(); }} wide>
          <GroupMembersPanel groupId={membersOf.id} />
        </Modal>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? t("grp_new", "New group") : t("grp_edit_title", "Edit {{name}}", { name: editing.name })}
          onClose={() => setEditing(null)}
          wide
        >
          <GroupForm
            key={editing === "new" ? "new" : `${editing.id}-${editing.updated_at}`}
            canEditName
            currentPhoto={editing === "new" ? null : editing.photo}
            initial={
              editing === "new"
                ? emptyGroupValues
                : {
                    name: editing.name, summary: editing.summary, description: editing.description,
                    activities: editing.activities, requirements: editing.requirements,
                    commitment: editing.commitment, contact_info: editing.contact_info, video_url: editing.video_url,
                  }
            }
            extra={<GroupAdminPicker groupId={editing === "new" ? null : editing.id} value={admin} onChange={setAdmin} />}
            submitLabel={editing === "new" ? t("grp_create", "Create group") : t("save")}
            submitting={saving}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default ServiceGroupsAdminPage;
