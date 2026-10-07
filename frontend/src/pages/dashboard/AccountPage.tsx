import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FiLock, FiMail, FiShield } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { Card, SectionHeader } from "../../components/ui/Card";
import { firstApiError } from "../../features/resources/utils";

type Setup = { pending: boolean; required: boolean; days_left: number; needs_email: boolean; needs_password: boolean } | null;

/** Change the login email (confirmed with a code) and the password. Also the "finish your account" page for slip holders. */
const AccountPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [setup, setSetup] = useState<Setup>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasPending, setWasPending] = useState(false);
  const sending = useRef(false); // blocks a double click before the screen has time to react

  const load = useCallback(async () => {
    const data = await api.getAccountStatus();
    setEmail(data.email);
    setSetup(data.setup);
    if (data.setup?.pending) setWasPending(true);
    return data;
  }, []);

  useEffect(() => { load().catch(() => toast.error(t("failed_load_family"))); }, [load, t]);

  const refreshUser = async () => {
    const data = await load();
    try { setUser(await api.getUser()); } catch { /* the page still works */ }
    // when the last missing step is done, the account is open again
    if (wasPending && data.setup && !data.setup.pending) {
      toast.success(t("acc_done", "Your account is ready."));
      navigate("/dashboard");
    }
  };

  const fail = (e: any) => toast.error(firstApiError(e?.response?.data) || e?.response?.data?.detail || t("adm_save_failed", "Could not save."));

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const res = await api.requestEmailCode(newEmail, emailPassword);
      setSentTo(res.sent_to);
      toast.success(t("acc_code_sent", "A code was sent to {{email}}.", { email: res.sent_to }));
    } catch (err) { fail(err); } finally { setBusy(false); sending.current = false; }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await api.confirmEmail(code);
      toast.success(t("acc_email_changed", "Your email was changed. Use it to sign in from now on."));
      setSentTo(null); setCode(""); setNewEmail(""); setEmailPassword("");
      await refreshUser();
    } catch (err) { fail(err); } finally { setBusy(false); sending.current = false; }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) { toast.error(t("acc_mismatch", "The two new passwords are not the same.")); return; }
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast.success(t("acc_password_changed", "Your password was changed."));
      setCurrent(""); setNext(""); setAgain("");
      await refreshUser();
    } catch (err) { fail(err); } finally { setBusy(false); sending.current = false; }
  };

  const pending = !!setup?.pending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SectionHeader
        title={pending ? t("acc_finish_title", "Finish your account") : t("acc_title", "Email and password")}
        description={pending
          ? (setup?.required
            ? t("acc_required", "Your login slip has expired. Add your own email and choose a new password to continue.")
            : t("acc_pending", "Your login slip works for {{n}} more day(s). Add your own email and choose a new password before it ends.", { n: setup?.days_left ?? 0 }))
          : t("acc_desc", "Change the email you sign in with, or your password.")}
        icon={<FiShield className="h-6 w-6" />}
      />

      <Card className={pending && setup?.needs_email ? "border-l-4 border-l-accent" : ""}>
        <div className="mb-3 flex items-center gap-2"><FiMail className="h-5 w-5 text-primary" /><h2 className="text-base font-semibold text-foreground">{t("acc_email", "Your email")}</h2></div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("acc_email_now", "You sign in with:")} <strong className="text-foreground">{email}</strong>
          {pending && setup?.needs_email && <span className="ml-2 text-amber-700">{t("acc_email_temp", "(a temporary email from your slip)")}</span>}
        </p>
        <p className="mb-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("acc_why", "Why a code? It proves that this email really belongs to you. Later, if you forget your password, the reset link goes to this email, so only you can use it.")}</p>
        {!sentTo ? (
          <form onSubmit={sendCode} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="acc-new-email">{t("acc_new_email", "New email")}</label>
              <input id="acc-new-email" type="email" className="input mt-1 w-full" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="acc-email-pass">{t("acc_current_password", "Current password")}</label>
              <input id="acc-email-pass" type="password" className="input mt-1 w-full" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">{busy ? t("acc_sending", "Sending the email...") : t("acc_send_code", "Send me a code")}</button>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("acc_code_hint", "Type the 6-digit code sent to {{email}}. It works for 15 minutes. Check the spam folder too.", { email: sentTo })}</p>
            <input className="input w-full max-w-[220px] text-center text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t("acc_code", "Code")} autoFocus />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || code.length !== 6} className="btn-primary px-4 py-2 text-sm">{busy ? t("adm_working", "Working...") : t("acc_confirm", "Confirm")}</button>
              <button type="button" onClick={() => { setSentTo(null); setCode(""); }} className="btn-outline px-4 py-2 text-sm">{t("acc_other_email", "Use another email")}</button>
            </div>
          </form>
        )}
      </Card>

      <Card className={pending && setup?.needs_password ? "border-l-4 border-l-accent" : ""}>
        <div className="mb-3 flex items-center gap-2"><FiLock className="h-5 w-5 text-primary" /><h2 className="text-base font-semibold text-foreground">{t("acc_password", "Your password")}</h2></div>
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="acc-cur">{t("acc_current_password", "Current password")}</label>
            <input id="acc-cur" type="password" className="input mt-1 w-full" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="acc-new">{t("acc_new_password", "New password")}</label>
            <input id="acc-new" type="password" className="input mt-1 w-full" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
            <p className="mt-1 text-xs text-muted-foreground">{t("acc_password_rules", "At least 8 letters, not only numbers, and not a common password.")}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="acc-again">{t("acc_repeat_password", "Repeat the new password")}</label>
            <input id="acc-again" type="password" className="input mt-1 w-full" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </div>
          <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">{busy ? t("saving") : t("acc_change_password", "Change password")}</button>
        </form>
      </Card>

      {user && !pending && <p className="text-xs text-muted-foreground">{t("acc_forgot_hint", "Forgot your password? Use Forgot password on the sign-in page: the link goes to your own email.")}</p>}
    </div>
  );
};

export default AccountPage;
