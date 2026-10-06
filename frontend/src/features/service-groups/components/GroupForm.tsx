import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { PhotoIcon } from "@heroicons/react/24/outline";
import GroupPhoto from "./GroupPhoto";

export interface GroupFormValues {
  name: string;
  summary: string;
  description: string;
  activities: string;
  requirements: string;
  commitment: string;
  contact_info: string;
  video_url: string;
}

export const emptyGroupValues: GroupFormValues = {
  name: "", summary: "", description: "", activities: "", requirements: "", commitment: "", contact_info: "", video_url: "",
};

const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  initial: GroupFormValues;
  currentPhoto?: string | null;
  /** Super Admin can also change the name; a Service Admin edits information only. */
  canEditName: boolean;
  /** Extra controls placed after the name (the Super Admin's admin picker). */
  extra?: ReactNode;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (data: FormData) => void;
  onCancel?: () => void;
}

const field = "mt-1 w-full";

/** The information that helps students choose a group. Used by the Super Admin and the group's own admin. */
const GroupForm = ({ initial, currentPhoto, canEditName, extra, submitLabel, submitting, onSubmit, onCancel }: Props) => {
  const { t } = useTranslation();
  const [values, setValues] = useState<GroupFormValues>(initial);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const set = (key: keyof GroupFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error(t("grp_photo_type", "Use a JPG, PNG or WebP photo."));
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      toast.error(t("grp_photo_size", "The photo is too large. The maximum is {{n}} MB.", { n: MAX_PHOTO_MB }));
      e.target.value = "";
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canEditName && !values.name.trim()) {
      toast.error(t("grp_name_required", "Give the group a name."));
      return;
    }
    if (values.video_url && !/^https?:\/\//i.test(values.video_url)) {
      toast.error(t("grp_video_invalid", "The video link must start with http:// or https://"));
      return;
    }
    const fd = new FormData();
    (Object.keys(values) as (keyof GroupFormValues)[]).forEach((key) => {
      if (key === "name" && !canEditName) return;
      fd.append(key, values[key]);
    });
    if (photo) fd.append("photo", photo);
    onSubmit(fd);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-48">
          <GroupPhoto photo={preview ?? currentPhoto} name={values.name || "?"} className="h-32 w-full rounded-xl sm:h-36" />
          <label className="btn-outline mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 px-3 py-1.5 text-xs">
            <PhotoIcon className="h-4 w-4" />
            {currentPhoto || preview ? t("grp_change_photo", "Change photo") : t("grp_add_photo", "Add a photo")}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} />
          </label>
        </div>

        <div className="flex-1 space-y-4">
          {canEditName && (
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="grp-name">{t("grp_name", "Group name")} *</label>
              <input id="grp-name" className={`input ${field}`} value={values.name} onChange={set("name")} maxLength={100} />
            </div>
          )}
          {extra}
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="grp-summary">{t("grp_summary", "One-line summary")}</label>
            <input id="grp-summary" className={`input ${field}`} value={values.summary} onChange={set("summary")} maxLength={200}
              placeholder={t("grp_summary_ph", "Shown on the group card, for example: We lead the singing at every program.")} />
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground" htmlFor="grp-desc">{t("grp_description", "About the group")}</label>
        <textarea id="grp-desc" rows={4} className={`input ${field}`} value={values.description} onChange={set("description")}
          placeholder={t("grp_description_ph", "What the group is, why it exists and what it means to serve in it.")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="grp-act">{t("grp_activities", "What members do")}</label>
          <textarea id="grp-act" rows={5} className={`input ${field}`} value={values.activities} onChange={set("activities")}
            placeholder={t("grp_activities_ph", "One activity per line")} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="grp-req">{t("grp_requirements", "Who should join")}</label>
          <textarea id="grp-req" rows={5} className={`input ${field}`} value={values.requirements} onChange={set("requirements")}
            placeholder={t("grp_requirements_ph", "Skills, interests or conditions. Say if no experience is needed.")} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="grp-com">{t("grp_commitment", "Time and place")}</label>
          <input id="grp-com" className={`input ${field}`} value={values.commitment} onChange={set("commitment")} maxLength={255}
            placeholder={t("grp_commitment_ph", "For example: Saturdays 2-4 pm, Block C hall")} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="grp-contact">{t("grp_contact", "Who to ask")}</label>
          <input id="grp-contact" className={`input ${field}`} value={values.contact_info} onChange={set("contact_info")} maxLength={255}
            placeholder={t("grp_contact_ph", "Name and phone or Telegram")} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground" htmlFor="grp-video">{t("grp_video", "Video link (optional)")}</label>
        <input id="grp-video" type="url" className={`input ${field}`} value={values.video_url} onChange={set("video_url")} maxLength={500}
          placeholder="https://youtube.com/watch?v=..." />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>}
        <button type="submit" disabled={submitting} className="btn-primary px-4 py-2 text-sm">{submitting ? t("saving") : submitLabel}</button>
      </div>
    </form>
  );
};

export default GroupForm;
