import { hasRole } from "../../features/auth/roles";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  CheckCircleIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowPathIcon,
  ClockIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

import Spinner from "../../components/ui/Spinner";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

interface PendingQuestion {
  id: string;
  display_name: string;
  category: string;
  question_body: string;
  created_at: string;
}

interface StaleQuestion {
  id: string;
  display_name: string;
  category: string;
  question_body: string;
  created_at: string;
  days_waiting: number;
  pending_answers: number;
}

interface PendingAnswer {
  id: number;
  question: string;
  question_body: string;
  question_category: string;
  question_asker: string;
  display_name: string;
  answer_body: string;
  created_at: string;
}

const CATEGORY_CHIP: Record<string, string> = {
  Academic: "bg-blue-500/10 text-blue-700",
  Spiritual: "bg-purple-500/10 text-purple-700",
  Family: "bg-emerald-500/10 text-emerald-700",
  Personal: "bg-rose-500/10 text-rose-700",
  Other: "bg-slate-500/10 text-slate-700",
};

const ModeratorQueue = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [answers, setAnswers] = useState<PendingAnswer[]>([]);
  const [stale, setStale] = useState<StaleQuestion[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isModerator = hasRole(user, "QA_moderator", "Super_admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, a, s] = await Promise.all([api.getModerationQueue(), api.getPendingAnswersAll(), api.getUnansweredQuestions()]);
      setQuestions(q);
      setAnswers(a);
      setStale(s);
    } catch (error) {
      console.error("Failed to fetch moderation queue", error);
      toast.error(t("failed_to_load_moderation_queue"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isModerator) load();
  }, [isModerator, load]);

  const approveQuestion = async (id: string) => {
    try {
      await api.approveQuestion(id);
      toast.success(t("question_approved"));
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch {
      toast.error(t("failed_to_approve_question"));
    }
  };

  const rejectQuestion = async (id: string) => {
    if (!(await confirm(t("confirm_reject_question")))) return;
    try {
      await api.rejectQuestion(id);
      toast.success(t("question_rejected"));
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch {
      toast.error(t("failed_to_reject_question"));
    }
  };

  const approveAnswer = async (id: number) => {
    try {
      await api.approveAnswer(id);
      toast.success(t("answer_approved"));
      setAnswers((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error(t("failed_to_approve_answer"));
    }
  };

  const rejectAnswer = async (id: number) => {
    if (!(await confirm(t("confirm_reject_answer")))) return;
    try {
      await api.rejectAnswer(id);
      toast.success(t("answer_rejected"));
      setAnswers((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error(t("failed_to_reject_answer"));
    }
  };

  // The moderator answers a question nobody answered: it is published at once
  const answerStale = async (id: string) => {
    const text = (reply[id] || "").trim();
    if (!text) return;
    setSending(id);
    try {
      await api.postAnswer({ question: id, display_name: user?.full_name || "Moderator", answer_body: text });
      toast.success(t("mod_answer_published", "Your answer is published."));
      setStale((prev) => prev.filter((q) => q.id !== id));
      setReply((prev) => ({ ...prev, [id]: "" }));
    } catch {
      toast.error(t("failed_post_answer"));
    } finally {
      setSending(null);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString();
  const chip = (category: string) => CATEGORY_CHIP[category] ?? CATEGORY_CHIP.Other;

  if (!isModerator && !loading) {
    return (
      <div className="text-center py-12">
        <div className="card p-8 max-w-md mx-auto">
          <CheckCircleIcon className="h-12 w-12 mx-auto text-red-500 mb-3" />
          <p className="text-foreground font-medium">{t("access_denied")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("moderator_access_only")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="h-8 w-8" />
      </div>
    );
  }

  const actionButtons = (onApprove: () => void, onReject: () => void) => (
    <div className="flex gap-2">
      <button onClick={onApprove} className="flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-sm text-white transition hover:bg-green-600">
        <CheckCircleIcon className="h-4 w-4" />{t("approve")}
      </button>
      <button onClick={onReject} className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-sm text-white transition hover:bg-red-600">
        <TrashIcon className="h-4 w-4" />{t("reject")}
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <motion.div initial="hidden" animate="visible" variants={fadeIn} className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("moderation_queue")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("moderation_queue_description")}</p>
        </div>
        <button onClick={load} className="btn-outline text-sm px-3 py-2 flex items-center gap-2" title={t("refresh")}>
          <ArrowPathIcon className="h-4 w-4" />
          {t("refresh")}
        </button>
      </motion.div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card bg-primary/5 border-primary/20 p-4 text-center">
          <ChatBubbleLeftRightIcon className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-2xl font-bold text-foreground">{questions.length}</p>
          <p className="text-sm text-muted-foreground">{t("pending_questions")}</p>
        </div>
        <div className="card bg-primary/5 border-primary/20 p-4 text-center">
          <ChatBubbleBottomCenterTextIcon className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-2xl font-bold text-foreground">{answers.length}</p>
          <p className="text-sm text-muted-foreground">{t("mod_pending_answers", "Answers waiting")}</p>
        </div>
        <div className={`card p-4 text-center ${stale.length > 0 ? "border-amber-300 bg-amber-50" : "bg-primary/5 border-primary/20"}`}>
          <ClockIcon className={`mx-auto mb-2 h-8 w-8 ${stale.length > 0 ? "text-amber-600" : "text-primary"}`} />
          <p className="text-2xl font-bold text-foreground">{stale.length}</p>
          <p className="text-sm text-muted-foreground">{t("mod_unanswered_week", "Unanswered for over a week")}</p>
        </div>
      </div>

      <motion.div initial="hidden" animate="visible" variants={fadeIn} className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("questions_awaiting_approval")}</h2>
          {questions.length === 0 ? (
            <div className="rounded-xl bg-muted/30 py-10 text-center text-muted-foreground">
              <CheckCircleIcon className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>{t("no_pending_questions")}</p>
            </div>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip(q.category)}`}>{q.category}</span>
                    <span className="text-xs text-muted-foreground">{q.display_name} • {formatDate(q.created_at)}</span>
                  </div>
                  {actionButtons(() => approveQuestion(q.id), () => rejectQuestion(q.id))}
                </div>
                <p className="mt-3 text-foreground">{q.question_body}</p>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("mod_stale_title", "Questions nobody has answered for over a week")}</h2>
            <p className="text-sm text-muted-foreground">{t("mod_stale_desc", "Public questions that are still waiting for an answer. Write the answer here: it is published right away.")}</p>
          </div>
          {stale.length === 0 ? (
            <div className="rounded-xl bg-muted/30 py-10 text-center text-muted-foreground">
              <CheckCircleIcon className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>{t("mod_no_stale", "Every public question older than a week has an answer.")}</p>
            </div>
          ) : (
            stale.map((q) => (
              <div key={q.id} className="card border-amber-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip(q.category)}`}>{q.category}</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    {t("mod_days_waiting", "{{n}} days without an answer", { n: q.days_waiting })}
                  </span>
                  <span className="text-xs text-muted-foreground">{q.display_name} • {formatDate(q.created_at)}</span>
                  {q.pending_answers > 0 && (
                    <span className="text-xs text-muted-foreground">{t("mod_has_pending", "{{n}} answer(s) are waiting for approval above", { n: q.pending_answers })}</span>
                  )}
                </div>
                <p className="mt-3 text-foreground">{q.question_body}</p>
                <textarea
                  value={reply[q.id] || ""}
                  onChange={(e) => setReply((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder={t("write_answer")}
                  rows={3}
                  className="input mt-3 text-sm"
                />
                <button
                  onClick={() => answerStale(q.id)}
                  disabled={sending === q.id || !(reply[q.id] || "").trim()}
                  className="btn-primary mt-2 px-4 py-2 text-sm"
                >
                  {sending === q.id ? t("saving", "Saving...") : t("mod_publish_answer", "Publish answer")}
                </button>
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t("mod_answers_awaiting", "Answers awaiting approval")}</h2>
          {answers.length === 0 ? (
            <div className="rounded-xl bg-muted/30 py-10 text-center text-muted-foreground">
              <CheckCircleIcon className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>{t("mod_no_pending_answers", "No answers are waiting.")}</p>
            </div>
          ) : (
            answers.map((a) => (
              <div key={a.id} className="card">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip(a.question_category)}`}>{a.question_category}</span>
                    <span className="text-xs text-muted-foreground">{t("mod_question_by", "Question by {{name}}", { name: a.question_asker })}</span>
                  </div>
                  <p className="text-sm text-foreground/80">{a.question_body}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-primary">{a.display_name} • {formatDate(a.created_at)}</p>
                    <p className="mt-1 whitespace-pre-line text-foreground">{a.answer_body}</p>
                  </div>
                  {actionButtons(() => approveAnswer(a.id), () => rejectAnswer(a.id))}
                </div>
              </div>
            ))
          )}
        </section>
      </motion.div>
    </div>
  );
};

export default ModeratorQueue;
