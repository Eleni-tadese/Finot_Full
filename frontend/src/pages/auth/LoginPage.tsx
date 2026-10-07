import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EyeIcon, EyeSlashIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../../context/AuthContext";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [wrongLogin, setWrongLogin] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = !email.trim()
    ? t("login_email_required")
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? t("login_email_invalid")
      : "";
  const passwordError = password ? "" : t("login_password_required");
  const showEmailError = touched.email && emailError;
  const showPasswordError = touched.password && passwordError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError || passwordError) {
      setTouched({ email: true, password: true });
      document.getElementById(emailError ? "email" : "password")?.focus();
      return;
    }
    setFormError("");
    setWrongLogin(false);
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard");
    } catch (error: any) {
      const wrong = !error.message || error.code === "wrong_credentials";
      setWrongLogin(wrong);
      setFormError(wrong ? t("login_wrong") : error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-background flex items-center justify-center px-4 py-6">
      <div className="max-w-md w-full">

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="card"
        >
          <h1 className="text-2xl font-bold text-center text-foreground mb-1">
            {t("welcome_back_simple")}
          </h1>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            {t("sign_in_to_account")}
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                <ExclamationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{t("login_failed")}</p>
                  <p>{formError}</p>
                  {wrongLogin && (
                    <Link to="/register" className="mt-1 inline-block font-medium underline">
                      {t("get_account_link", "How do I get an account?")}
                    </Link>
                  )}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                {t("email_address")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFormError(""); }}
                onBlur={() => setTouched((v) => ({ ...v, email: true }))}
                placeholder="you@example.com"
                autoComplete="username"
                aria-invalid={!!showEmailError}
                aria-describedby={showEmailError ? "email-error" : undefined}
                className={`input ${showEmailError ? "border-destructive focus:ring-destructive/30" : ""}`}
              />
              {showEmailError && (
                <p id="email-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
                  <ExclamationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(""); }}
                  onBlur={() => setTouched((v) => ({ ...v, password: true }))}
                  placeholder={t("enter_password")}
                  autoComplete="current-password"
                  aria-invalid={!!showPasswordError}
                  aria-describedby={showPasswordError ? "password-error" : undefined}
                  className={`input pr-10 ${showPasswordError ? "border-destructive focus:ring-destructive/30" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              {showPasswordError && (
                <p id="password-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-destructive">
                  <ExclamationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {passwordError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-primary hover:text-primary-light font-medium transition">
                {t("forgot_password_q")}
              </Link>
              <Link to="/register" className="text-primary hover:text-primary-light font-medium transition">
                {t("get_account_link", "How do I get an account?")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting ? t("signing_in") : t("sign_in")}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;