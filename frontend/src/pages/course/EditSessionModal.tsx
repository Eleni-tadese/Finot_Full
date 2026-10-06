import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { firstApiError } from "../../features/resources/utils";
import { Modal } from "../../features/admin-console/components/AdminUi";
import { api } from "../../lib/api";

interface Props {
  session: { id: string; date: string; topic: string | null; teacher_name: string | null };
  onClose: () => void;
  onDone: () => void;
}

/** Change one class day: move it to another date, or set the topic and teacher. */
const EditSessionModal = ({ session, onClose, onDone }: Props) => {
  const { t } = useTranslation();
  const [date, setDate] = useState(session.date);
  const [topic, setTopic] = useState(session.topic ?? "");
  const [teacher, setTeacher] = useState(session.teacher_name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateCourseSession(session.id, { date, topic: topic.trim() || null, teacher_name: teacher.trim() || null });
      toast.success(t("adm_saved", "Saved."));
      onDone();
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t("cd_edit_day", "Edit class day")}
      onClose={onClose}
      footer={<>
        <button className="btn-outline" onClick={onClose}>{t("cancel", "Cancel")}</button>
        <button className="btn-primary" disabled={saving || !date} onClick={save}>{saving ? t("adm_working", "Working...") : t("save", "Save")}</button>
      </>}
    >
      <div className="space-y-3">
        <label className="block text-sm font-medium">{t("session_date", "Date")}
          <input type="date" className="input mt-1 w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">{t("topic_optional", "Topic (optional)")}
          <input className="input mt-1 w-full" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">{t("teacher_name_optional", "Teacher name (optional)")}
          <input className="input mt-1 w-full" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">{t("cd_move_hint", "Moving the date keeps the attendance already marked for this day.")}</p>
      </div>
    </Modal>
  );
};

export default EditSessionModal;
