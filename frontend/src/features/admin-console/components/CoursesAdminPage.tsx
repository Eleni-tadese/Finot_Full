import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import { api } from "../../../lib/api";
import type { Curriculum, SemesterCourseRow } from "../types";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";
import UserPicker, { PickedUser } from "./UserPicker";
import CourseStatusBadge from "../../../components/course/CourseStatusBadge";

const BATCHES = [1, 2, 3, 4, 5];
const thisYear = new Date().getFullYear();

const personName = (p: { first_name: string; middle_name?: string; last_name: string }) =>
  [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ");

const CoursesAdminPage = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"curriculums" | "offerings">("curriculums");
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [offerings, setOfferings] = useState<SemesterCourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // curriculum form
  const [editingCur, setEditingCur] = useState<Curriculum | "new" | null>(null);
  const [curForm, setCurForm] = useState({ title: "", description: "", batch_year: 1, is_active: true });

  // offering form
  const [editingOff, setEditingOff] = useState<SemesterCourseRow | "new" | null>(null);
  const [offForm, setOffForm] = useState({ course: "", academic_year: thisYear, semester: 1 });
  const [coordinators, setCoordinators] = useState<PickedUser[]>([]);
  const [picker, setPicker] = useState<PickedUser | null>(null);

  // enrolment
  const [enrolling, setEnrolling] = useState<SemesterCourseRow | null>(null);
  const [enrollBatch, setEnrollBatch] = useState(1);

  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([adminApi.curriculums(), adminApi.semesterCourses()]);
      setCurriculums(c);
      setOfferings(o);
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const fail = (e: any) => toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));

  const openCurriculum = (c: Curriculum | "new") => {
    setCurForm(c === "new"
      ? { title: "", description: "", batch_year: 1, is_active: true }
      : { title: c.title, description: c.description ?? "", batch_year: c.batch_year, is_active: c.is_active });
    setEditingCur(c);
  };

  const saveCurriculum = async () => {
    if (!curForm.title.trim()) { toast.error(t("crs_title_required", "Please enter a title.")); return; }
    setSaving(true);
    try {
      await adminApi.saveCurriculum(editingCur === "new" || !editingCur ? null : editingCur.id, {
        ...curForm, title: curForm.title.trim(), description: curForm.description.trim() || null,
      });
      toast.success(t("adm_saved", "Saved."));
      setEditingCur(null);
      await load();
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const removeCurriculum = async (c: Curriculum) => {
    if (!(await confirm(t("crs_confirm_delete_cur", "Delete \"{{title}}\" and every semester course, session and attendance record under it?", { title: c.title })))) return;
    try { await adminApi.deleteCurriculum(c.id); toast.success(t("adm_deleted", "Deleted.")); await load(); } catch (e) { fail(e); }
  };

  const openOffering = (o: SemesterCourseRow | "new", courseId?: string) => {
    if (o === "new") {
      setOffForm({ course: courseId ?? curriculums.find((c) => c.is_active)?.id ?? "", academic_year: thisYear, semester: 1 });
      setCoordinators([]);
    } else {
      setOffForm({ course: o.course, academic_year: o.academic_year, semester: o.semester });
      setCoordinators(o.coordinators_details.map((p) => ({ id: p.id, full_name: personName(p), email: p.email })));
    }
    setPicker(null);
    setEditingOff(o);
  };

  const addCoordinator = (u: PickedUser | null) => {
    if (u && !coordinators.some((c) => c.id === u.id)) setCoordinators([...coordinators, u]);
    setPicker(null);
  };

  const saveOffering = async () => {
    if (!offForm.course) { toast.error(t("crs_pick_curriculum", "Choose a curriculum first.")); return; }
    setSaving(true);
    try {
      await adminApi.saveSemesterCourse(editingOff === "new" || !editingOff ? null : editingOff.id, {
        ...offForm, coordinators: coordinators.map((c) => c.id),
      });
      toast.success(t("adm_saved", "Saved."));
      setEditingOff(null);
      await load();
    } catch (e) { fail(e); } finally { setSaving(false); }
  };

  const removeOffering = async (o: SemesterCourseRow) => {
    if (!(await confirm(t("crs_confirm_delete_off", "Delete this semester course with its sessions and attendance?")))) return;
    try { await adminApi.deleteSemesterCourse(o.id); toast.success(t("adm_deleted", "Deleted.")); await load(); } catch (e) { fail(e); }
  };

  const enroll = async () => {
    if (!enrolling) return;
    setSaving(true);
    try {
      const r = await adminApi.bulkEnroll(enrolling.id, enrollBatch);
      toast.success(t("crs_enrolled", "{{n}} new students enrolled.", { n: r.new_enrollments }));
      setEnrolling(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally { setSaving(false); }
  };

  // Start (PLANNED -> OPEN), complete (OPEN -> COMPLETED) or reopen (COMPLETED -> OPEN) a semester course.
  // Students only see a course once it is Open (or Completed).
  const changeStatus = async (o: SemesterCourseRow, next: "PLANNED" | "OPEN" | "COMPLETED") => {
    if (next === "OPEN" && o.status === "PLANNED"
      && !(await confirm(t("crs_confirm_start", "Start this course? The students of this batch will see it in My courses.")))) return;
    if (next === "COMPLETED"
      && !(await confirm(t("crs_confirm_complete", "Mark this course as completed? Students keep the materials and their attendance. Class days and attendance can no longer be changed (you can reopen it).")))) return;
    try {
      await api.setSemesterCourseStatus(o.id, next);
      toast.success(t("crs_status_saved", "Course updated."));
      await load();
    } catch (e) { fail(e); }
  };

  const semesterLabel = (n: number) => (n === 1 ? t("crs_sem_1", "First semester") : t("crs_sem_2", "Second semester"));

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        title={t("crs_title", "Courses")}
        description={t("crs_desc", "Create the curriculums, open them for a semester, name the student coordinators and enrol a batch. Coordinators then add sessions and take attendance from their own menu.")}
        actions={
          tab === "curriculums"
            ? <button className="btn-primary" onClick={() => openCurriculum("new")}>{t("crs_new_curriculum", "New curriculum")}</button>
            : <button className="btn-primary" disabled={curriculums.length === 0} onClick={() => openOffering("new")}>{t("crs_new_offering", "Open for a semester")}</button>
        }
      />

      <div className="mb-4 flex gap-2 border-b border-border">
        {(["curriculums", "offerings"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {k === "curriculums" ? t("crs_tab_curriculums", "Curriculums") : t("crs_tab_offerings", "Semester courses")}
          </button>
        ))}
      </div>

      {tab === "curriculums" ? (
        curriculums.length === 0 ? (
          <Empty>{t("crs_no_curriculums", "No curriculums yet. Create the first one.")}</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {curriculums.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{c.title}</h3>
                  <div className="flex shrink-0 gap-1">
                    <Chip tone="primary">{t("crs_batch", "Batch {{n}}", { n: c.batch_year })}</Chip>
                    <Chip tone={c.is_active ? "green" : "muted"}>{c.is_active ? t("crs_active", "Active") : t("crs_inactive", "Inactive")}</Chip>
                  </div>
                </div>
                {c.description && <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>}
                {!offerings.some((o) => o.course === c.id) && (
                  <p className="mt-2 text-sm text-amber-700">{t("crs_not_opened", "Not opened for any semester yet.")}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <button className="font-medium text-primary hover:underline" onClick={() => openOffering("new", c.id)}>{t("crs_new_offering", "Open for a semester")}</button>
                  <button className="text-primary hover:underline" onClick={() => openCurriculum(c)}>{t("edit", "Edit")}</button>
                  <button className="text-destructive hover:underline" onClick={() => removeCurriculum(c)}>{t("delete", "Delete")}</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : offerings.length === 0 ? (
        <Empty>{curriculums.length === 0
          ? t("crs_need_curriculum", "Create a curriculum first, then open it for a semester.")
          : t("crs_no_offerings", "No semester courses yet.")}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {offerings.map((o) => (
            <div key={o.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{o.course_details.title}</h3>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <CourseStatusBadge status={o.status} />
                  <Chip tone="primary">{t("crs_batch", "Batch {{n}}", { n: o.course_details.batch_year })}</Chip>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{o.academic_year} · {semesterLabel(o.semester)} · {t("crs_students_n", "{{n}} student(s) enrolled", { n: o.enrollment_count ?? 0 })}</p>
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">{t("crs_coordinators", "Coordinators")}: </span>
                {o.coordinators_details.length === 0
                  ? <span className="text-amber-700">{t("crs_none_yet", "none yet")}</span>
                  : o.coordinators_details.map(personName).join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {o.status === "PLANNED" && (
                  <button className="font-semibold text-primary hover:underline" onClick={() => changeStatus(o, "OPEN")}>{t("crs_start", "Start course")}</button>
                )}
                {o.status === "OPEN" && (
                  <button className="text-primary hover:underline" onClick={() => changeStatus(o, "COMPLETED")}>{t("crs_complete", "Complete course")}</button>
                )}
                {o.status === "COMPLETED" && (
                  <button className="text-primary hover:underline" onClick={() => changeStatus(o, "OPEN")}>{t("crs_reopen", "Reopen")}</button>
                )}
                <button className="text-primary hover:underline" onClick={() => openOffering(o)}>{t("edit", "Edit")}</button>
                <button className="text-primary hover:underline" onClick={() => { setEnrollBatch(o.course_details.batch_year); setEnrolling(o); }}>{t("crs_enrol_batch", "Enrol a batch")}</button>
                <button className="text-destructive hover:underline" onClick={() => removeOffering(o)}>{t("delete", "Delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingCur && (
        <Modal
          title={editingCur === "new" ? t("crs_new_curriculum", "New curriculum") : t("crs_edit_curriculum", "Edit curriculum")}
          onClose={() => setEditingCur(null)}
          footer={<>
            <button className="btn-outline" onClick={() => setEditingCur(null)}>{t("cancel", "Cancel")}</button>
            <button className="btn-primary" disabled={saving} onClick={saveCurriculum}>{saving ? t("adm_working", "Working...") : t("save", "Save")}</button>
          </>}
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium">{t("crs_field_title", "Title")}
              <input className="input mt-1 w-full" value={curForm.title} onChange={(e) => setCurForm({ ...curForm, title: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">{t("crs_field_desc", "Description")}
              <textarea className="input mt-1 w-full" rows={3} value={curForm.description} onChange={(e) => setCurForm({ ...curForm, description: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">{t("crs_field_batch", "Batch (year of study)")}
              <select className="input mt-1 w-full" value={curForm.batch_year} onChange={(e) => setCurForm({ ...curForm, batch_year: Number(e.target.value) })}>
                {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={curForm.is_active} onChange={(e) => setCurForm({ ...curForm, is_active: e.target.checked })} />
              {t("crs_field_active", "Still in use")}
            </label>
          </div>
        </Modal>
      )}

      {editingOff && (
        <Modal
          title={editingOff === "new" ? t("crs_new_offering", "Open for a semester") : t("crs_edit_offering", "Edit semester course")}
          onClose={() => setEditingOff(null)}
          footer={<>
            <button className="btn-outline" onClick={() => setEditingOff(null)}>{t("cancel", "Cancel")}</button>
            <button className="btn-primary" disabled={saving} onClick={saveOffering}>{saving ? t("adm_working", "Working...") : t("save", "Save")}</button>
          </>}
        >
          <div className="space-y-3">
            <label className="block text-sm font-medium">{t("crs_field_curriculum", "Curriculum")}
              <select className="input mt-1 w-full" value={offForm.course} onChange={(e) => setOffForm({ ...offForm, course: e.target.value })}>
                <option value="">—</option>
                {curriculums.map((c) => <option key={c.id} value={c.id}>{c.title} (batch {c.batch_year})</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">{t("crs_field_year", "Academic year")}
                <input type="number" className="input mt-1 w-full" value={offForm.academic_year} onChange={(e) => setOffForm({ ...offForm, academic_year: Number(e.target.value) })} />
              </label>
              <label className="block text-sm font-medium">{t("crs_field_semester", "Semester")}
                <select className="input mt-1 w-full" value={offForm.semester} onChange={(e) => setOffForm({ ...offForm, semester: Number(e.target.value) })}>
                  <option value={1}>{semesterLabel(1)}</option>
                  <option value={2}>{semesterLabel(2)}</option>
                </select>
              </label>
            </div>
            <div>
              <p className="text-sm font-medium">{t("crs_coordinators", "Coordinators")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {coordinators.length === 0 && <span className="text-sm text-muted-foreground">{t("crs_none_yet", "none yet")}</span>}
                {coordinators.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs text-primary">
                    {c.full_name}
                    <button type="button" aria-label={t("adm_remove", "Remove")} onClick={() => setCoordinators(coordinators.filter((x) => x.id !== c.id))}>×</button>
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <UserPicker
                  value={picker}
                  onChange={addCoordinator}
                  label={t("crs_add_coordinator", "Add a coordinator")}
                  hint={t("crs_pick_hint", "Only people who already have the Course Coordinator role are listed. Give the role first in Users & roles.")}
                  role="CourseCoordinator"
                />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {enrolling && (
        <Modal
          title={t("crs_enrol_batch", "Enrol a batch")}
          onClose={() => setEnrolling(null)}
          footer={<>
            <button className="btn-outline" onClick={() => setEnrolling(null)}>{t("cancel", "Cancel")}</button>
            <button className="btn-primary" disabled={saving} onClick={enroll}>{saving ? t("adm_working", "Working...") : t("crs_enrol", "Enrol")}</button>
          </>}
        >
          <p className="text-sm text-muted-foreground">
            {t("crs_enrol_desc", "Every active, in-campus student of the chosen batch is added to {{title}}. Students already enrolled are left alone.", { title: enrolling.course_details.title })}
          </p>
          <label className="mt-3 block text-sm font-medium">{t("crs_field_batch", "Batch (year of study)")}
            <select className="input mt-1 w-full" value={enrollBatch} onChange={(e) => setEnrollBatch(Number(e.target.value))}>
              {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </Modal>
      )}
    </div>
  );
};

export default CoursesAdminPage;
