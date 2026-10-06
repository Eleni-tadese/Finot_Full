import { hasRole } from "../../features/auth/roles";
import { useConfirm } from "../../components/ui/ConfirmProvider";
import { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  PlusCircleIcon,
  PencilIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  LockClosedIcon,
  GlobeAltIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

import Pagination from "../../components/ui/Pagination";
import Spinner from "../../components/ui/Spinner";
import SearchBar from "../../components/ui/SearchBar";

import { api } from "../../lib/api";
import { BACKEND_PAGE_SIZE } from "../../lib/api.real";
import { useAuth } from "../../context/AuthContext";
import { Question, Answer } from "../../types";

const LONG_ANSWER_LIMIT = 230;

// Fixed category list: matches the backend model's category choices
const ALL_CATEGORIES = ["Spiritual", "Academic", "Family", "Personal", "Other"];

// One colour per category, used for the chip and the avatar
const CATEGORY_STYLE: Record<string, { chip: string; avatar: string }> = {
  Spiritual: { chip: "bg-purple-500/10 text-purple-700", avatar: "bg-purple-500" },
  Academic: { chip: "bg-blue-500/10 text-blue-700", avatar: "bg-blue-500" },
  Family: { chip: "bg-emerald-500/10 text-emerald-700", avatar: "bg-emerald-500" },
  Personal: { chip: "bg-rose-500/10 text-rose-700", avatar: "bg-rose-500" },
  Other: { chip: "bg-slate-500/10 text-slate-700", avatar: "bg-slate-500" },
};
const styleOf = (category: string) => CATEGORY_STYLE[category] ?? CATEGORY_STYLE.Other;

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

// Extended Question type with visibility
interface ExtendedQuestion extends Question {
  visibility: "PUBLIC" | "PRIVATE";
}

/** The round letter next to a name. */
const Avatar = ({ name, color }: { name: string; color: string }) => (
  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${color}`}>
    {(name || "?").trim().charAt(0).toUpperCase()}
  </span>
);

/** The category filter row: coloured pills instead of one dark block. */
const CategoryPills = ({ selected, onChange, label }: { selected: string; onChange: (v: string) => void; label: (c: string) => string }) => (
  <div className="flex flex-wrap gap-2">
    {["all", ...ALL_CATEGORIES].map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
          selected === c ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        }`}
      >
        {c === "all" ? label("all") : label(c)}
      </button>
    ))}
  </div>
);

const QuestionList = ({ isDashboard = false }: { isDashboard?: boolean }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Public questions state
  const [questions, setQuestions] = useState<ExtendedQuestion[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editedQuestionBody, setEditedQuestionBody] = useState("");
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [composing, setComposing] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<{ question: ExtendedQuestion; answer: Answer } | null>(null);

  // Private questions state (using same Question type with visibility=PRIVATE)
  const [privateQuestions, setPrivateQuestions] = useState<ExtendedQuestion[]>([]);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | "private">("public");
  const [privateCategoryFilter, setPrivateCategoryFilter] = useState("all");

  const isAdmin = hasRole(user, "QA_counselor", "Super_admin");
  const isLoggedIn = !!user;

  const isInitialMount = useRef(true);

  const categoryLabel = (c: string) => (c === "all" ? t("all", "All") : t(`cat_${c.toLowerCase()}`, c));

  // Debounce search input to avoid excessive API calls
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter]);

  // Handle URL parameter to open private tab
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "private") {
      setActiveTab("private");
    }
  }, [searchParams]);

  // Fetch public questions from backend (only APPROVED + PUBLIC)
  const fetchQuestions = useCallback(async (showSpinner: boolean = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await api.getQuestionsPaginated(
        currentPage,
        debouncedSearch || undefined,
        categoryFilter === "all" ? undefined : categoryFilter
      );
      setQuestions(data.results);
      setTotalCount(data.count);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404 && currentPage > 1) {
        setCurrentPage(1);
        return;
      }
      console.error("Failed to fetch questions", error);
      toast.error(t("failed_load_questions"));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [currentPage, debouncedSearch, categoryFilter, t]);

  // Fetch private questions from backend using /private-inbox/ endpoint
  const fetchPrivateQuestions = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPrivate(true);
    try {
      const privateInbox = await api.getPrivateInbox();
      setPrivateQuestions(privateInbox);
    } catch (error) {
      console.error("Failed to fetch private questions", error);
      toast.error(t("failed_load_private_questions"));
    } finally {
      setLoadingPrivate(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchQuestions(true);
  }, [fetchQuestions]);

  useEffect(() => {
    if (activeTab === "private" && user?.id) {
      fetchPrivateQuestions();
    }
  }, [activeTab, user?.id, fetchPrivateQuestions]);

  const submitAnswer = async (questionId: string) => {
    const answer = answerText[questionId];
    if (!answer?.trim()) return;
    setPosting(questionId);
    try {
      await api.postAnswer({
        question: questionId,
        display_name: user?.full_name || "Anonymous",
        answer_body: answer,
      });
      toast.success(t("qa_answer_sent", "Thank you! Your answer is waiting for the moderator's approval."));
      await fetchQuestions(false);
      if (activeTab === "private") {
        await fetchPrivateQuestions();
      }
      setAnswerText((prev) => ({ ...prev, [questionId]: "" }));
      setComposing((prev) => ({ ...prev, [questionId]: false }));
    } catch (error: any) {
      console.error("Failed to post answer", error);
      const status = error?.response?.status;
      toast.error(
        status === 401 || status === 403
          ? t("qa_sign_in_to_answer_error", "Please sign in to answer a question.")
          : error?.response?.data?.detail || t("failed_post_answer")
      );
    } finally {
      setPosting(null);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    if (!(await confirm(t("delete_question_confirm")))) return;
    try {
      await api.deleteQuestion(questionId);
      toast.success(t("question_deleted"));
      await fetchQuestions(false);
      if (activeTab === "private") {
        await fetchPrivateQuestions();
      }
    } catch (error) {
      console.error("Failed to delete question", error);
      toast.error(t("failed_delete_question"));
    }
  };

  const deleteAnswer = async (answerId: number) => {
    if (!(await confirm(t("delete_answer_confirm")))) return;
    try {
      await api.deleteAnswer(answerId);
      toast.success(t("answer_deleted"));
      await fetchQuestions(false);
    } catch (error) {
      console.error("Failed to delete answer", error);
      toast.error(t("failed_delete_answer"));
    }
  };

  const updateQuestion = async (questionId: string, newBody: string, wasApproved: boolean) => {
    try {
      await api.updateQuestion(questionId, { question_body: newBody });

      // If the question was already approved, show moderation reset message
      if (wasApproved) {
        toast.success(t("question_updated_moderation"));
        // Remove from current list since it needs re-approval
        setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      } else {
        toast.success(t("question_updated"));
      }

      await fetchQuestions(false);
      setEditingQuestion(null);
    } catch (error) {
      console.error("Failed to update question", error);
      toast.error(t("failed_update_question"));
    }
  };

  const canModify = (itemUserId?: number | null) => {
    if (!itemUserId) return false;
    return isAdmin || (isLoggedIn && user?.id === itemUserId);
  };

  const totalPages = Math.ceil(totalCount / BACKEND_PAGE_SIZE);

  const getApprovedAnswers = (q: ExtendedQuestion) => (q.answers || []).filter((a) => a.is_approved ?? true);
  const previewAnswer = (text: string) => text.length > LONG_ANSWER_LIMIT ? `${text.slice(0, LONG_ANSWER_LIMIT)}...` : text;

  const askRoute = isDashboard ? "/dashboard/questions/ask" : "/anonymous/ask";
  const backRoute = isDashboard ? "/dashboard" : "/anonymous";

  // Render Private Questions List (using data from /private-inbox/)
  const renderPrivateQuestions = () => {
    if (loadingPrivate) {
      return (
        <div className="flex justify-center py-12">
          <Spinner size="h-8 w-8" />
        </div>
      );
    }

    if (!isLoggedIn) {
      return (
        <div className="card flex flex-col items-center py-12 text-center">
          <LockClosedIcon className="mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="font-medium text-foreground">{t("qa_private_sign_in", "Sign in to see your private questions and their answers.")}</p>
          <Link to="/login" className="btn-primary mt-4 text-sm">{t("sign_in", "Sign in")}</Link>
        </div>
      );
    }

    if (privateQuestions.length === 0) {
      return (
        <div className="card flex flex-col items-center py-12 text-center">
          <LockClosedIcon className="mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="text-foreground">{t("no_private_questions")}</p>
        </div>
      );
    }

    const filteredQuestions = privateCategoryFilter === "all"
      ? privateQuestions
      : privateQuestions.filter((q) => q.category === privateCategoryFilter);

    if (filteredQuestions.length === 0) {
      return (
        <div className="card py-12 text-center text-muted-foreground">
          {t("no_private_questions_match_category")}
        </div>
      );
    }

    return filteredQuestions.map((q) => {
      const answers = q.answers || [];
      const primaryAnswer = answers.find((a) => a.is_approved);
      const answered = answers.length > 0;
      const style = styleOf(q.category);

      return (
        <div key={q.id} className="card">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}>{categoryLabel(q.category)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <LockClosedIcon className="h-3 w-3" /> {t("private")}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(q.created_at)}</span>
            <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${answered ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {answered ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <ClockIcon className="h-3.5 w-3.5" />}
              {answered ? t("answered") : t("awaiting_answer")}
            </span>
          </div>

          <p className="mt-3 text-foreground">{q.question_body}</p>

          {primaryAnswer && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="mb-1 text-xs font-semibold text-primary">{t("answer")}</p>
              <p className="whitespace-pre-line text-sm text-foreground/80">{primaryAnswer.answer_body}</p>
            </div>
          )}

          {answers.filter((a) => !a.is_approved && a.id !== primaryAnswer?.id).length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("additional_comments")}</p>
              {answers.filter((a) => !a.is_approved && a.id !== primaryAnswer?.id).map((a) => (
                <div key={a.id} className="rounded-lg bg-muted/30 p-2">
                  <p className="text-xs text-foreground/70">{a.answer_body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading && activeTab === "public") {
    return (
      <div className={`${isDashboard ? "" : "min-h-screen bg-background"} flex items-center justify-center py-20`}>
        <Spinner size="h-8 w-8" />
      </div>
    );
  }

  const tabButton = (key: "public" | "private", icon: ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(key)}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
        activeTab === key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className={isDashboard ? "" : "min-h-screen bg-background py-8 px-4"}>
      <div className="mx-auto max-w-4xl">
        {!isDashboard && (
          <Link to={backRoute} className="mb-4 inline-flex items-center text-sm font-medium text-primary transition hover:text-primary-light">
            <ArrowLeftIcon className="mr-1.5 h-4 w-4" /> {t("back")}
          </Link>
        )}

        {/* Header */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground sm:flex">
                <ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{t("community_questions")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("qa_page_description")}</p>
                <p className="mt-2 text-xs font-medium text-primary">{t("qa_count", "{{n}} question(s) answered by the community", { n: totalCount })}</p>
              </div>
            </div>
            <Link to={askRoute} className="btn-primary inline-flex shrink-0 items-center gap-1.5 self-start text-sm sm:self-center">
              <PlusCircleIcon className="h-4 w-4" /> {t("ask_question")}
            </Link>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {tabButton("public", <GlobeAltIcon className="h-4 w-4" />, t("public_questions"))}
          {tabButton("private", <LockClosedIcon className="h-4 w-4" />, t("my_private_questions"))}
        </div>

        <motion.div initial="hidden" animate="visible" variants={fadeIn} className="space-y-5">
          {activeTab === "public" ? (
            <>
              <div className="space-y-3">
                <SearchBar value={searchTerm} onChange={(v) => setSearchTerm(v)} />
                <CategoryPills selected={categoryFilter} onChange={setCategoryFilter} label={categoryLabel} />
              </div>

              {questions.length === 0 && !loading ? (
                <div className="card flex flex-col items-center py-12 text-center">
                  <ChatBubbleLeftRightIcon className="mb-3 h-10 w-10 text-muted-foreground/60" />
                  <p className="font-medium text-foreground">
                    {debouncedSearch || categoryFilter !== "all"
                      ? t("no_questions_match_filter", "No questions match your search or filter.")
                      : t("no_questions_yet", "No questions yet. Be the first to ask!")}
                  </p>
                  {!(debouncedSearch || categoryFilter !== "all") && (
                    <Link to={askRoute} className="btn-primary mt-4 inline-flex items-center gap-1.5 text-sm">
                      <PlusCircleIcon className="h-4 w-4" /> {t("ask_question")}
                    </Link>
                  )}
                </div>
              ) : (
                questions.map((q) => {
                  const answers = getApprovedAnswers(q);
                  const style = styleOf(q.category);
                  return (
                    <div key={q.id} className="card">
                      <div className="flex items-start gap-3">
                        <Avatar name={q.display_name} color={style.avatar} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{q.display_name}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}>{categoryLabel(q.category)}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(q.created_at)}</span>
                            <span className="ml-auto flex items-center gap-2">
                              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{t("answers_count", { count: answers.length })}</span>
                              {canModify(q.user) && (
                                <>
                                  <button onClick={() => { setEditingQuestion(q.id); setEditedQuestionBody(q.question_body); }} className="text-muted-foreground hover:text-foreground">
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => deleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive">
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </span>
                          </div>

                          {editingQuestion === q.id ? (
                            <div className="mt-3 space-y-2">
                              <textarea value={editedQuestionBody} onChange={(e) => setEditedQuestionBody(e.target.value)} className="input" rows={3} />
                              <div className="flex gap-2">
                                <button onClick={() => updateQuestion(q.id, editedQuestionBody, q.is_approved)} className="btn-primary px-3 py-1.5 text-sm">{t("save")}</button>
                                <button onClick={() => setEditingQuestion(null)} className="btn-outline px-3 py-1.5 text-sm">{t("cancel")}</button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 text-lg leading-snug text-foreground">{q.question_body}</p>
                          )}
                        </div>
                      </div>

                      {answers.length > 0 && (
                        <div className="mt-4 space-y-2 border-l-2 border-primary/20 pl-4">
                          {answers.map((a) => (
                            <div key={a.id} className="rounded-xl bg-muted/50 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-primary">{a.display_name}</span>
                                {canModify(a.responder) && (
                                  <button onClick={() => deleteAnswer(a.id)} className="text-muted-foreground hover:text-destructive">
                                    <TrashIcon className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">{previewAnswer(a.answer_body)}</p>
                              {a.answer_body.length > LONG_ANSWER_LIMIT && (
                                <button onClick={() => setSelectedAnswer({ question: q, answer: a })} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary">
                                  <ArrowsPointingOutIcon className="h-3.5 w-3.5" /> {t("read_full_answer")}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4">
                        {!isLoggedIn ? (
                          <p className="text-sm text-muted-foreground">
                            <Link to="/login" className="font-medium text-primary hover:underline">{t("qa_sign_in_link", "Sign in")}</Link>{" "}
                            {t("qa_sign_in_to_answer", "to answer this question.")}
                          </p>
                        ) : composing[q.id] ? (
                          <div>
                            <textarea
                              value={answerText[q.id] || ""}
                              onChange={(e) => setAnswerText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                              placeholder={t("write_answer")}
                              rows={3}
                              className="input text-sm"
                              autoFocus
                            />
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => submitAnswer(q.id)} disabled={posting === q.id || !answerText[q.id]?.trim()} className="btn-primary px-4 py-2 text-sm">
                                {posting === q.id ? t("saving", "Saving...") : t("post_answer")}
                              </button>
                              <button onClick={() => setComposing((prev) => ({ ...prev, [q.id]: false }))} className="btn-outline px-4 py-2 text-sm">{t("cancel")}</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setComposing((prev) => ({ ...prev, [q.id]: true }))} className="btn-outline px-4 py-1.5 text-sm">
                            {t("qa_write_answer_btn", "Write an answer")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t("my_private_questions")}</h2>
                <p className="text-sm text-muted-foreground">{t("private_questions_description")}</p>
              </div>

              <CategoryPills selected={privateCategoryFilter} onChange={setPrivateCategoryFilter} label={categoryLabel} />

              {renderPrivateQuestions()}
            </>
          )}
        </motion.div>
      </div>

      {/* Full answer modal */}
      {selectedAnswer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm" onClick={() => setSelectedAnswer(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card max-h-[80vh] w-full max-w-lg overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs text-muted-foreground">{t("answers_by", { name: selectedAnswer.answer.display_name })}</p>
            <p className="whitespace-pre-line leading-relaxed text-foreground">{selectedAnswer.answer.answer_body}</p>
            <button onClick={() => setSelectedAnswer(null)} className="btn-outline mt-4 w-full text-sm">{t("close")}</button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default QuestionList;
