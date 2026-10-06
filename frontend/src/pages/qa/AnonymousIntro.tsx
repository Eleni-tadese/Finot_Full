import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  ArrowRightIcon,
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import ImageSlideshow from "../../components/ui/ImageSlideshow";
import { api } from "../../lib/api";

const HERO_IMAGES = [1, 2, 3, 4, 5].map((n) => `/images/gibi${n}.jpg`);
const STEP_IMAGES = [
  "/images/service-groups/group1.jpg",
  "/images/service-groups/group2.jpg",
  "/images/service-groups/group3.jpg",
  "/images/service-groups/group4.jpg",
];

const AnonymousIntro = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  const [answered, setAnswered] = useState<any[]>([]);

  // What visitors can read right away: the latest approved questions that already have an answer
  useEffect(() => {
    api.getQuestionsPaginated(1)
      .then((page) => setAnswered(page.results.filter((q: any) => (q.answers || []).some((a: any) => a.is_approved ?? true)).slice(0, 4)))
      .catch(() => setAnswered([]));
  }, []);

  const highlights = [
    { title: t("ask_anonymously"), description: t("ask_anonymously_desc"), icon: LockClosedIcon },
    { title: t("verified_responses"), description: t("verified_responses_desc"), icon: ShieldCheckIcon },
    { title: t("community_support"), description: t("community_support_desc"), icon: UserGroupIcon },
  ];

  const steps = [
    { title: t("ask_anonymously"), description: t("no_reg_needed"), icon: ChatBubbleLeftRightIcon },
    { title: t("choose_category"), description: t("choose_category_desc"), icon: ArrowRightOnRectangleIcon },
    { title: t("receive_responses"), description: t("receive_responses_desc"), icon: ShieldCheckIcon },
    { title: t("community_support"), description: t("peer_support_desc"), icon: UserGroupIcon },
  ];

  // The "how it works" panel walks through the steps by itself until the visitor clicks one.
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % steps.length), 5000);
    return () => clearInterval(timer);
  }, [auto, steps.length]);

  const current = steps[step];

  return (
    <div className="bg-background">
      {/* Hero with a slideshow behind the title */}
      <section className="relative h-[420px] md:h-[480px]">
        <ImageSlideshow images={HERO_IMAGES} overlay>
          <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-4 pb-16 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl font-bold text-white md:text-5xl"
            >
              {t("emahoy_title")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-4 max-w-2xl text-lg text-white/90 md:text-xl"
            >
              {t("emahoy_subtitle")}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-wrap justify-center gap-3"
            >
              <Link to="/anonymous/ask" className="btn-primary inline-flex items-center gap-2 px-6 py-3">
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {t("ask_anonymously")}
              </Link>
              <Link
                to="/anonymous/questions"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-white/70 px-6 py-3 font-medium text-white transition hover:bg-white hover:text-primary"
              >
                {t("join_conversation")}
                <ArrowRightIcon className="h-5 w-5" />
              </Link>
            </motion.div>
          </div>
        </ImageSlideshow>
      </section>

      {/* One bar with the three promises, overlapping the hero */}
      <section className="relative z-10 mx-auto -mt-12 max-w-5xl px-4">
        <div className="grid divide-y divide-border rounded-2xl border border-border bg-card shadow-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {highlights.map((h) => (
            <div key={h.title} className="flex items-start gap-4 p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <h.icon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{h.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{h.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive "how it works" */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold text-primary">{t("how_it_works")}</h2>
        <div className="grid gap-6 md:grid-cols-5">
          <ol className="space-y-2 md:col-span-2">
            {steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => { setStep(i); setAuto(false); }}
                  className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                    i === step
                      ? "border-primary bg-primary text-primary-foreground shadow-card"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      i === step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="relative min-h-[280px] overflow-hidden rounded-2xl shadow-card md:col-span-3">
            <div className="absolute inset-0">
              <ImageSlideshow images={STEP_IMAGES} index={step} dots={false} overlay />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-0 bottom-0 z-10 p-6 text-white"
              >
                <current.icon className="mb-3 h-9 w-9 text-accent" />
                <h3 className="text-xl font-semibold">{current.title}</h3>
                <p className="mt-1 text-white/90">{current.description}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Questions that were already answered, so a visitor sees what this place is for */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-3xl font-bold text-primary">{t("intro_answered_title", "Questions already answered")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("intro_answered_desc", "Maybe someone already asked what you are wondering about.")}</p>
          </div>
          <Link to="/anonymous/questions" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {t("intro_see_all", "See all questions")} <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {answered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            {t("intro_answered_empty", "No answered question yet. Be the first to ask!")}
            <div className="mt-4">
              <Link to="/anonymous/ask" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">{t("ask_anonymously")}</Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {answered.map((q) => {
              const first = (q.answers || []).find((a: any) => a.is_approved ?? true);
              return (
                <Link key={q.id} to="/anonymous/questions" className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/40">
                  <span className="mb-2 w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{String(t(`cat_${String(q.category).toLowerCase()}`, q.category))}</span>
                  <p className="font-semibold text-foreground">{q.question_body}</p>
                  {first && (
                    <p className="mt-2 line-clamp-3 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">{first.answer_body}</p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                    {t("intro_read_more", "Read more")} <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Closing call to action */}
      <section className="bg-primary px-4 py-12 text-center">
        <h2 className="text-2xl font-bold text-white md:text-3xl">{t("emahoy_title")}</h2>
        <Link to="/anonymous/ask" className="btn-primary mt-6 inline-flex items-center gap-2 px-8 py-3">
          {t("ask_anonymously")}
          <ArrowRightIcon className="h-5 w-5" />
        </Link>
      </section>
    </div>
  );
};

export default AnonymousIntro;
