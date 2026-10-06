import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import Swal from "../../lib/popup";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

const fadeInUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const ResetPasswordConfirmPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { uid, token } = useParams();
  const [formData, setFormData] = useState({ new_password: "", confirm_password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uid || !token) {
      Swal.fire({
        icon: "error",
        title: t("reset_invalid_link_title"),
        text: t("reset_invalid_link_text"),
        confirmButtonColor: "#fbbf24",
        background: "#142850",
        color: "#fff",
      });
      return;
    }

    if (!formData.new_password || !formData.confirm_password) {
      Swal.fire({
        icon: "warning",
        title: t("reset_missing_title"),
        text: t("reset_missing_text"),
        confirmButtonColor: "#fbbf24",
        background: "#142850",
        color: "#fff",
      });
      return;
    }

    if (formData.new_password !== formData.confirm_password) {
      Swal.fire({
        icon: "warning",
        title: t("reset_mismatch_title"),
        text: t("reset_mismatch_text"),
        confirmButtonColor: "#fbbf24",
        background: "#142850",
        color: "#fff",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.requestPasswordResetConfirm(uid, token, formData.new_password, formData.confirm_password);
      Swal.fire({
        icon: "success",
        title: t("reset_success_title"),
        text: t("reset_success_text"),
        confirmButtonColor: "#fbbf24",
        background: "#142850",
        color: "#fff",
      });
      navigate("/login");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: t("reset_failed_title"),
        text: error?.response?.data?.detail || error.message || t("reset_failed_text"),
        confirmButtonColor: "#fbbf24",
        background: "#142850",
        color: "#fff",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-background py-6 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-primary hover:text-primary-light font-medium text-sm transition"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            {t("reset_back_home")}
          </Link>
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="card"
        >
          <h1 className="text-3xl font-bold text-center text-foreground mb-2">
            {t("reset_title")}
          </h1>
          <p className="text-center text-muted-foreground mb-8">
            {t("reset_subtitle")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t("reset_new_password")}
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="new_password"
                  value={formData.new_password}
                  onChange={handleChange}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={t("reset_toggle_new")}
                >
                  {showNewPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {t("reset_confirm_password")}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirm_password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  className="input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={t("reset_toggle_confirm")}
                >
                  {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t("reset_submitting") : t("reset_submit")}
            </button>

            <div className="text-center text-sm">
              <Link
                to="/login"
                className="text-primary hover:text-primary-light font-medium transition"
              >
                {t("reset_back_login")}
              </Link>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPasswordConfirmPage;
