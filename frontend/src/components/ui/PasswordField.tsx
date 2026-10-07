import { useState, InputHTMLAttributes } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

/** A password box with an eye button to show or hide what was typed. */
const PasswordField = ({ className = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={shown ? "text" : "password"} className={`input w-full pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        aria-label={shown ? t("hide_password", "Hide password") : t("show_password", "Show password")}
        title={shown ? t("hide_password", "Hide password") : t("show_password", "Show password")}
      >
        {shown ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </div>
  );
};

export default PasswordField;
