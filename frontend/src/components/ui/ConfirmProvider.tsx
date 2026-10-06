import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiHelpCircle } from "react-icons/fi";

type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** Red confirm button for things that delete or remove. Default true. */
  danger?: boolean;
};

type Confirm = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Use instead of window.confirm: `if (!(await confirm("Delete this?"))) return;` */
export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>((input) => {
    const next = typeof input === "string" ? { message: input } : input;
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const close = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  const danger = options?.danger !== false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-100 text-red-600" : "bg-primary/10 text-primary"}`}>
                {danger ? <FiAlertTriangle className="h-5 w-5" /> : <FiHelpCircle className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h2 id="confirm-title" className="font-semibold text-foreground">{options.title ?? t("confirm_title", "Please confirm")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{options.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => close(false)} className="btn-outline px-4 py-2 text-sm">
                {t("cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] ${danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-light"}`}
              >
                {options.confirmLabel ?? t("confirm", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
