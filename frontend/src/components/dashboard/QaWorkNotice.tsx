import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

/**
 * When a moderator, counselor or the Super Admin signs in, say what waits for them.
 * Shown once per sign-in (a new login gets a new token), then the bell and the pages keep it up to date.
 */
const QaWorkNotice = ({ userId }: { userId: number | string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    let key = "qa_work_notice";
    try {
      key = `qa_work_${userId}_${(localStorage.getItem("access_token") || "").slice(-16)}`;
      if (sessionStorage.getItem(key)) return;
      // mark it NOW: React runs this effect twice in development, and both runs must not show the card
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: show it anyway */
    }

    api.getMyQaWork().then((work) => {
      const lines: { text: string; path: string }[] = [];
      const m = work.moderation;
      if (m && (m.questions > 0 || m.answers > 0)) {
        lines.push({
          text: t("qa_work_moderation", "{{q}} question(s) and {{a}} answer(s) wait for your approval", { q: m.questions, a: m.answers }),
          path: "/dashboard/counselor/approve",
        });
      }
      if (m && m.unanswered > 0) {
        lines.push({
          text: t("qa_work_unanswered", "{{n}} public question(s) have had no answer for over a week", { n: m.unanswered }),
          path: "/dashboard/counselor/approve",
        });
      }
      if (work.counselor && work.counselor.unanswered > 0) {
        lines.push({
          text: t("qa_work_counselor", "{{n}} private question(s) wait for your answer", { n: work.counselor.unanswered }),
          path: "/dashboard/counselor/queue",
        });
      }
      if (work.admin && work.admin.needs_counselor > 0) {
        lines.push({
          text: t("qa_work_admin", "{{n}} private question(s) need a counselor", { n: work.admin.needs_counselor }),
          path: "/dashboard/admin/qa",
        });
      }
      if (lines.length === 0) return;

      toast.custom(
        (item) => (
          <div className={`pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-elevated transition ${item.visible ? "opacity-100" : "opacity-0"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{t("qa_work_title", "Waiting for you")}</p>
              <button
                onClick={() => toast.dismiss(item.id)}
                aria-label={t("close", "Close")}
                className="-mr-1 -mt-1 shrink-0 rounded-full px-2 text-lg leading-none text-muted-foreground hover:bg-muted"
              >
                ×
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {lines.map((l) => (
                <li key={l.text} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>{l.text}</span>
                  <button
                    onClick={() => { toast.dismiss(item.id); navigate(l.path); }}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  >
                    {t("qa_work_open", "Open")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
        { id: "qa-work-notice", duration: 7000, position: "top-right" }
      );
    }).catch(() => {
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }  // could not load: try again next time
    });
  }, [userId, t, navigate]);

  return null;
};

export default QaWorkNotice;
