import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import axiosInstance from "../../../lib/axios";
import { firstApiError } from "../../resources/utils";
import type { ServiceGroup } from "../../../types";
import GroupForm from "./GroupForm";

/** A Service Admin fills in what helps students choose their group. */
const GroupInfoEditor = ({ group, onSaved }: { group: ServiceGroup; onSaved: (g: ServiceGroup) => void }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const save = async (data: FormData) => {
    setSaving(true);
    try {
      const res = await axiosInstance.patch<ServiceGroup>(`/api/service/groups/${group.id}/`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSaved(res.data);
      toast.success(t("grp_saved", "Group information saved. Students can see it now."));
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("grp_info_title", "Information for students")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("grp_info_desc", "Students read this when they choose a group. The more clearly you say what you do and what is expected, the better the match.")}
          </p>
        </div>
        <Link to={`/dashboard/service/${group.id}`} className="btn-outline px-3 py-1.5 text-sm">{t("grp_preview", "See what students see")}</Link>
      </div>

      <GroupForm
        key={group.updated_at ?? group.id}
        canEditName={false}
        currentPhoto={group.photo}
        initial={{
          name: group.name,
          summary: group.summary ?? "",
          description: group.description ?? "",
          activities: group.activities ?? "",
          requirements: group.requirements ?? "",
          commitment: group.commitment ?? "",
          contact_info: group.contact_info ?? "",
          video_url: group.video_url ?? "",
        }}
        submitLabel={t("save")}
        submitting={saving}
        onSubmit={save}
      />
    </div>
  );
};

export default GroupInfoEditor;
