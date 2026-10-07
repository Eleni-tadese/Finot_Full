import toast from "react-hot-toast";
import i18n from "./i18n";
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo, FiX } from "react-icons/fi";

type Icon = "success" | "error" | "warning" | "info" | "question";

type PopupOptions = {
  icon?: Icon;
  title?: string;
  text?: string;
  html?: string;
  // old SweetAlert options are accepted and ignored so existing calls keep working
  [other: string]: unknown;
};

const STYLE: Record<Icon, { bar: string; tint: string; Icon: React.ElementType }> = {
  success: { bar: "bg-emerald-500", tint: "text-emerald-600", Icon: FiCheckCircle },
  error: { bar: "bg-red-500", tint: "text-red-600", Icon: FiAlertCircle },
  warning: { bar: "bg-amber-500", tint: "text-amber-600", Icon: FiAlertTriangle },
  info: { bar: "bg-blue-500", tint: "text-blue-600", Icon: FiInfo },
  question: { bar: "bg-blue-500", tint: "text-blue-600", Icon: FiInfo },
};

const plain = (html?: string) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Drop-in for the old SweetAlert `fire`: shows a slide-in notification in the corner instead of a blocking pop-up box.
 * Errors stay a little longer than good news.
 */
function fire(options: PopupOptions): Promise<{ isConfirmed: boolean }> {
  const kind: Icon = options.icon ?? "info";
  const { bar, tint, Icon: Glyph } = STYLE[kind];
  const body = options.text || plain(options.html);

  toast.custom(
    (item) => (
      <div
        className={`${item.visible ? "animate-enter" : "animate-leave"} pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-card`}
        role={kind === "error" ? "alert" : "status"}
      >
        <div className={`w-1.5 shrink-0 ${bar}`} />
        <div className="flex flex-1 items-start gap-3 p-4">
          <Glyph className={`mt-0.5 h-5 w-5 shrink-0 ${tint}`} />
          <div className="min-w-0 flex-1">
            {options.title && <p className="text-sm font-semibold text-foreground">{options.title}</p>}
            {body && <p className="mt-0.5 break-words text-sm text-muted-foreground">{body}</p>}
          </div>
          <button type="button" onClick={() => toast.dismiss(item.id)} className="text-muted-foreground hover:text-foreground" aria-label={i18n.t("close")}>
            <FiX className="h-4 w-4" />
          </button>
        </div>
      </div>
    ),
    { duration: kind === "error" || kind === "warning" ? 7000 : 4500 },
  );
  return Promise.resolve({ isConfirmed: true });
}

const popup = { fire };
export default popup;
