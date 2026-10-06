import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  UsersIcon,
  CurrencyDollarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import Swal from "../../lib/popup";
import { api } from "../../lib/api";
import ImageSlideshow from "../../components/ui/ImageSlideshow";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const HERO_IMAGES = [1, 2, 3, 4, 5].map((n) => `/images/gibi${n}.jpg`);
const QUICK_AMOUNTS = [100, 250, 500, 1000];

const DonationOutside = () => {
  const { t } = useTranslation();

  const benefits = [
    { title: t("student_donations"), description: t("student_donations_desc"), icon: UsersIcon },
    { title: t("one_time_donations"), description: t("one_time_donations_desc"), icon: CurrencyDollarIcon },
    { title: t("transparent_trackable"), description: t("transparent_trackable_desc"), icon: ShieldCheckIcon },
  ];

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    amount: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, amount } = formData;
    if (!amount) {
      Swal.fire({
        icon: "warning",
        title: t("missing_fields"),
        text: t("don_amount_needed", "Please enter the amount you want to give."),
        confirmButtonColor: "hsl(52,94%,54%)",
      });
      return;
    }
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Swal.fire({
        icon: "warning",
        title: t("invalid_amount"),
        text: t("invalid_amount_text"),
        confirmButtonColor: "hsl(52,94%,54%)",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const { checkout_url } = await api.createDonation({
        amount: amount.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      window.location.href = checkout_url;
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: t("payment_error"),
        text:
          error?.response?.data?.detail ||
          error?.message ||
          t("something_went_wrong"),
        confirmButtonColor: "hsl(52,94%,54%)",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Left: pictures and the reasons to give */}
      <section className="relative hidden lg:block">
        <ImageSlideshow images={HERO_IMAGES} overlay>
          <div className="flex h-full flex-col justify-end p-10 pb-14 text-white">
            <motion.h1 initial="hidden" animate="visible" variants={fadeIn} className="text-4xl font-bold leading-tight">
              {t("support_gibigubae", "Support our Gibi Gubae")}
            </motion.h1>
            <p className="mt-3 max-w-md text-white/85">{t("donation_intro_desc")}</p>
            <ul className="mt-8 space-y-5">
              {benefits.map((b) => (
                <li key={b.title} className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <b.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{b.title}</p>
                    <p className="text-sm text-white/80">{b.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </ImageSlideshow>
      </section>

      {/* Right: the form */}
      <section className="flex items-center justify-center bg-background px-4 py-6 sm:px-8">
        <motion.div initial="hidden" animate="visible" variants={fadeIn} className="w-full max-w-md">
          <div className="mb-4 lg:hidden">
            <h1 className="text-2xl font-bold text-primary">{t("support_gibigubae", "Support our Gibi Gubae")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("donation_intro_desc")}</p>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <CurrencyDollarIcon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-foreground">{t("donate_now")}</h2>
              <p className="text-sm text-muted-foreground">{t("chapa_redirect")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("don_name_optional", "Your name (optional)")}</label>
              <input name="name" value={formData.name} onChange={handleChange} placeholder={t("don_name_placeholder", "Leave empty to give quietly")} className="input py-2.5" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{t("don_email_optional", "Your email (optional)")}</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" className="input py-2.5" />
              <p className="mt-1 text-xs text-muted-foreground">{t("don_email_note", "Only if you want a receipt by email. You do not have to give any personal information. After paying, Chapa shows you a receipt anyway.")}</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">{t("amount_etb")} *</label>
              <div className="mb-2 flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, amount: String(a) }))}
                    className={`rounded-xl border px-4 py-1.5 text-sm font-semibold transition ${
                      formData.amount === String(a)
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground hover:border-accent"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <input name="amount" type="number" min="1" step="0.01" value={formData.amount} onChange={handleChange} placeholder="100" className="input py-2.5" />
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? t("redirecting_to_chapa") : t("donate_with_chapa")}
            </button>
          </form>
        </motion.div>
      </section>
    </div>
  );
};

export default DonationOutside;
