import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "../../../components/ui/Card";
import { firstApiError } from "../../resources/utils";
import { adminApi } from "../api";
import { SPECIALIZATIONS, type Counselor, type PrivateQuestion, type Specialization } from "../types";
import { Chip, Empty, Loading, Modal, PageHeader } from "./AdminUi";

type Filter = "needs" | "unanswered" | "all";

const QaAdminPage = () => {
  const { t } = useTranslation();
  const specLabel = (s: Specialization | null) => (s ? t(`specialization_${s}`) : null);
  const [questions, setQuestions] = useState<PrivateQuestion[]>([]);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("needs");
  const [assigning, setAssigning] = useState<PrivateQuestion | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, c] = await Promise.all([adminApi.privateQuestions(), adminApi.counselors()]);
      setQuestions(q);
      setCounselors(c);
    } catch {
      toast.error(t("adm_load_failed", "Could not load this page. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (filter === "needs") return questions.filter((q) => q.needs_assignment);
    if (filter === "unanswered") return questions.filter((q) => q.answer_count === 0);
    return questions;
  }, [questions, filter]);

  const needsCount = questions.filter((q) => q.needs_assignment).length;
  const unansweredCount = questions.filter((q) => q.answer_count === 0).length;

  const openAssign = (q: PrivateQuestion) => { setAssigning(q); setChosen(q.assigned_to.map((a) => a.id)); };
  const toggle = (id: number) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const saveAssignment = async () => {
    if (!assigning) return;
    setSaving(true);
    try {
      const updated = await adminApi.assignQuestion(assigning.id, chosen);
      setQuestions((prev) => prev.map((q) => (q.id === assigning.id ? { ...q, assigned_to: updated.assigned_to, needs_assignment: updated.needs_assignment } : q)));
      toast.success(t("adm_assignment_saved", "Assignment saved."));
      setAssigning(null);
    } catch (e: any) {
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const changeSpecialization = async (c: Counselor, spec: Specialization) => {
    const next = c.specializations.includes(spec) ? c.specializations.filter((s) => s !== spec) : [...c.specializations, spec];
    setCounselors((prev) => prev.map((x) => (x.id === c.id ? { ...x, specializations: next } : x))); // optimistic
    try {
      await adminApi.setSpecializations(c.id, next);
    } catch (e: any) {
      setCounselors((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      toast.error(firstApiError(e?.response?.data) || t("adm_save_failed", "Could not save."));
    }
  };

  // Counselors whose specialization matches the question come first in the picker
  const sortedCounselors = (q: PrivateQuestion) =>
    [...counselors].sort((a, b) => Number(b.specializations.includes(q.specialization as Specialization)) - Number(a.specializations.includes(q.specialization as Specialization)));

  if (loading) return <Loading />;

  const tabs: { key: Filter; label: string; n?: number }[] = [
    { key: "needs", label: t("adm_tab_needs", "Needs assignment"), n: needsCount },
    { key: "unanswered", label: t("adm_tab_unanswered", "Unanswered"), n: unansweredCount },
    { key: "all", label: t("adm_tab_all", "All private questions"), n: questions.length },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <section>
        <PageHeader
          title={t("adm_qa_title", "Private Q&A")}
          description={t("adm_qa_desc", "Counselors see private questions that match their specialization. Personal questions are sensitive: nobody sees them until you assign a counselor. An assigned question is visible only to the people you choose.")}
        />

        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${filter === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label} <span className="ml-1 text-xs opacity-70">({tab.n})</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty>{filter === "needs" ? t("adm_nothing_to_assign", "Nothing needs assignment right now.") : t("adm_no_questions", "No questions here.")}</Empty>
        ) : (
          <div className="space-y-3">
            {visible.map((q) => (
              <Card key={q.id} className={q.needs_assignment ? "border-amber-300" : ""}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="primary">{q.category}</Chip>
                  {specLabel(q.specialization) && <Chip tone="amber">{specLabel(q.specialization)}</Chip>}
                  {q.needs_assignment && <Chip tone="red">{t("adm_needs_assign_chip", "Needs a counselor")}</Chip>}
                  {q.answer_count > 0 ? <Chip tone="green">{t("adm_answered", "Answered")}</Chip> : <Chip>{t("adm_unanswered", "Unanswered")}</Chip>}
                  <span className="text-xs text-muted-foreground">{q.asker_name} · {new Date(q.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-foreground">{q.question_body}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {t("adm_assigned_to", "Assigned to:")}
                    {q.assigned_to.length === 0
                      ? <span>{t("adm_nobody", "nobody (visible by specialization)")}</span>
                      : q.assigned_to.map((a) => <Chip key={a.id} tone="primary">{a.name}</Chip>)}
                  </div>
                  <button onClick={() => openAssign(q)} className="btn-outline px-3 py-1.5 text-sm">{t("adm_assign", "Assign counselors")}</button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground">{t("adm_counselors_title", "Counselors and their specializations")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("adm_counselors_desc", "Tick what each counselor handles. Give the Psychotherapist specialization only to trained people; those questions are never shown without your assignment.")}</p>
        {counselors.length === 0 ? (
          <Empty>{t("adm_no_counselors", "No one has the QA Counselor role yet. Give it in Users & roles.")}</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("adm_name", "Name")}</th>
                  {SPECIALIZATIONS.map((s) => <th key={s.value} className="px-4 py-3">{specLabel(s.value)}</th>)}
                  <th className="px-4 py-3">{t("adm_assigned", "Assigned")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {counselors.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3"><p className="font-medium text-foreground">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.email}</p></td>
                    {SPECIALIZATIONS.map((s) => (
                      <td key={s.value} className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4" aria-label={`${c.full_name} ${specLabel(s.value)}`} checked={c.specializations.includes(s.value)} onChange={() => changeSpecialization(c, s.value)} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-muted-foreground">{c.assigned_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assigning && (
        <Modal
          title={t("adm_assign_title", "Assign counselors")}
          onClose={() => setAssigning(null)}
          footer={
            <>
              <button onClick={() => setAssigning(null)} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
              <button onClick={saveAssignment} disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? t("saving") : t("save")}</button>
            </>
          }
        >
          <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">{assigning.question_body}</p>
          {counselors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("adm_no_counselors", "No one has the QA Counselor role yet. Give it in Users & roles.")}</p>
          ) : (
            <div className="space-y-2">
              {sortedCounselors(assigning).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                  <span className="flex-1 text-sm text-foreground">{c.full_name}</span>
                  {c.specializations.includes(assigning.specialization as Specialization) && <Chip tone="green">{t("adm_matches", "matches")}</Chip>}
                </label>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t("adm_assign_hint", "Leave everyone unticked to remove the assignment. Then the question goes back to normal routing by specialization.")}</p>
        </Modal>
      )}
    </div>
  );
};

export default QaAdminPage;
