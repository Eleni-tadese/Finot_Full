import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import Swal from "../../lib/popup";
import { useAuth } from "../../context/AuthContext";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/** "Abebe Kebede Desta" -> ["Abebe", "Kebede", "Desta"]; any extra names stay with the last part. */
const splitName = (full: string) => full.trim().split(/\s+/).filter(Boolean);

const RegisterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    gender: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const isPasswordStrong = (password: string) => {
    return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /\W/.test(password);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (splitName(formData.full_name).length < 3) newErrors.full_name = t("reg_full_name_error", "Write your first, father's and grandfather's names.");
    if (!formData.email) newErrors.email = t("field_required", { field: t("email") });
    if (!formData.gender) newErrors.gender = t("field_required", { field: t("gender_label") });
    if (!formData.password) newErrors.password = t("field_required", { field: t("password") });
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = t("passwords_dont_match");
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!isPasswordStrong(formData.password)) {
      Swal.fire({
        icon: "warning",
        title: t("weak_password"),
        text: t("weak_password_text"),
        confirmButtonColor: "hsl(52, 94%, 54%)",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const [first, middle, ...rest] = splitName(formData.full_name);
      await register({
        first_name: first,
        middle_name: middle,
        last_name: rest.join(" "),
        email: formData.email,
        gender: formData.gender,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });
      navigate("/dashboard");
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: t("registration_failed"),
        text: error.message || t("something_went_wrong"),
        confirmButtonColor: "hsl(52, 94%, 54%)",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "input";
  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <div className="min-h-full bg-background py-6 px-4 flex items-center justify-center">
      <div className="w-full max-w-2xl">

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          className="card"
        >
          <h1 className="text-2xl font-bold text-center text-foreground mb-1">
            {t("join_finot")}
          </h1>
          <p className="text-center text-muted-foreground mb-4 text-sm">
            {t("create_account_to_start")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>{t("full_name_label", "Full name")} *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder={t("reg_full_name_ph", "First, father's and grandfather's name")}
                className={inputClass}
                autoComplete="name"
              />
              {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
            </div>

            <div>
              <label className={labelClass}>{t("gender_label")} *</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className={inputClass}>
                <option value="">{t("select_gender")}</option>
                <option value="M">{t("male")}</option>
                <option value="F">{t("female")}</option>
              </select>
              {errors.gender && <p className="mt-1 text-xs text-destructive">{errors.gender}</p>}
            </div>
            </div>

            <div>
              <label className={labelClass}>{t("email")} *</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" className={inputClass} />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t("password")} *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={t("create_strong_password")}
                  className={`${inputClass} pr-10`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>

            <div>
              <label className={labelClass}>{t("confirm_password")} *</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder={t("re_enter_password")}
                  className={`${inputClass} pr-10`}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground">
                  {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>}
            </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
              {isSubmitting ? t("creating_account") : t("create_account")}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {t("already_have_account")}{" "}
              <Link to="/login" className="text-primary font-medium hover:text-primary-light transition">{t("sign_in")}</Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;