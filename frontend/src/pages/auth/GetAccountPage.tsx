import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

/** Shown instead of a sign-up form: accounts are given by the organization on a printed slip. */
const GetAccountPage = () => {
  const { t } = useTranslation();
  const steps = [
    t("ga_step1", "The organization gives you a slip with your login email and password at the welcome event."),
    t("ga_step2", "Sign in with that email and password."),
    t("ga_step3", "Write your name and complete your profile."),
    t("ga_step4", "Within a few weeks, add your own real email (confirmed with a code) and choose a new password."),
  ];
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-foreground">{t("ga_title", "Get your finot account")}</h1>
        <p className="mb-5 text-center text-sm text-muted-foreground">{t("ga_sub", "Accounts are given by the organization. You do not create one yourself.")}</p>
        <ol className="mb-5 space-y-3">
          {steps.map((text, i) => (
            <li key={i} className="flex gap-3 text-sm text-foreground">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
        <p className="mb-5 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
          {t("ga_lost", "No slip yet, or you lost it? Ask the organization for a new one.")} <Link to="/contact" className="font-medium text-primary hover:underline">{t("ga_contact", "Contact us")}</Link>
        </p>
        <Link to="/login" className="btn-primary block w-full text-center">{t("sign_in")}</Link>
      </motion.div>
    </div>
  );
};

export default GetAccountPage;
