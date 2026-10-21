// Student screen: /dashboard/my-badge
// The personal QR badge. It is a signed text from the server (FB1.<id>.<version>.<signature>): showing it needs no
// network, so the student can save it as a picture or print it and show it at the door.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import { FiDownload, FiPrinter, FiShield } from "react-icons/fi";

import { Card, SectionHeader } from "../../../components/ui/Card";
import { attendanceApi } from "../api";

const STORAGE_KEY = "finot.attendance.badge";

export default function MyBadgePage() {
  const { t } = useTranslation();
  const [badge, setBadge] = useState<{ badge: string; name: string } | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null; // last known badge, so the page works offline too
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    attendanceApi
      .myBadge()
      .then((b) => {
        setBadge(b);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ badge: b.badge, name: b.name }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => setError(true));
  }, []);

  const download = () => {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas || !badge) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `finot-badge-${badge.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t("badge_title", "My badge")} description={t("badge_desc", "Show this QR at the door; the organizer scans it and you are marked present.")} icon={<FiShield className="h-6 w-6" />} />
      <Card className="text-center print:border-0 print:shadow-none">
        {badge ? (
          <>
            <div ref={wrap} className="mx-auto my-2 w-fit rounded-xl bg-white p-4">
              <QRCodeCanvas value={badge.badge} size={256} level="M" includeMargin={false} />
            </div>
            <p className="text-xl font-semibold text-foreground">{badge.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("badge_keep", "Save it as a picture or print it. It works without internet. Do not share it: it is your own.")}</p>
            <div className="mt-4 flex justify-center gap-2 print:hidden">
              <button type="button" onClick={download} className="btn-primary flex items-center gap-1 px-3 py-2 text-sm">
                <FiDownload className="h-4 w-4" /> {t("badge_save", "Save picture")}
              </button>
              <button type="button" onClick={() => window.print()} className="btn-outline flex items-center gap-1 px-3 py-2 text-sm">
                <FiPrinter className="h-4 w-4" /> {t("badge_print", "Print")}
              </button>
            </div>
          </>
        ) : error ? (
          <p className="py-8 text-sm text-destructive">{t("badge_failed", "The badge could not be loaded. Check your connection and try again.")}</p>
        ) : (
          <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>
        )}
      </Card>
    </div>
  );
}
