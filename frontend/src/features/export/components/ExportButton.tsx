import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import axiosInstance from "../../../lib/axios";

interface ExportButtonProps {
  /** Path under /api/analytics/export/, e.g. "events/" or "event-attendance/?event=3" */
  path: string;
  disabled?: boolean;
  className?: string;
}

const filenameFrom = (header?: string) => header?.match(/filename="?([^";]+)"?/)?.[1] ?? "export.xlsx";

/** Downloads a server-generated .xlsx file (the request carries the login token). */
const ExportButton = ({ path, disabled, className = "btn-outline text-sm flex items-center gap-2" }: ExportButtonProps) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await axiosInstance.get(`/api/analytics/export/${path}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(res.headers["content-disposition"]);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("export_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={download} disabled={disabled || busy} className={className}>
      <ArrowDownTrayIcon className="h-4 w-4" />
      {busy ? t("exporting") : t("export_excel")}
    </button>
  );
};

export default ExportButton;
