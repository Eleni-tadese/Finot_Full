import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiBell, FiCheckCircle } from "react-icons/fi";
import { api } from "../../lib/api";
import { NOTIFICATIONS_CHANGED, announceNotificationsChanged } from "../../lib/notificationsSync";
import { Card, SectionHeader } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  notification_type: "EVENT" | "DONATION" | "REMINDER" | "SYSTEM" | "QA" | string;
  is_read: boolean;
  created_at: string;
};

const typeVariant: Record<string, "primary" | "success" | "warning" | "accent" | "default"> = {
  EVENT: "primary",
  DONATION: "success",
  REMINDER: "warning",
  QA: "accent",
  SYSTEM: "default",
};

// Where a notification leads when it is clicked.
const targetFor = (type: string): string => {
  switch (type) {
    case "QA":
      return "/dashboard/questions?tab=private";
    case "EVENT":
      return "/dashboard/events";
    case "DONATION":
    case "REMINDER":
      return "/dashboard/donations/history";
    default:
      return "/dashboard/notifications";
  }
};

function DashboardNotifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getUserNotifications();
        if (!cancelled) { setItems(Array.isArray(data) ? (data as NotificationItem[]) : []); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, []);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const markRead = async (n: NotificationItem) => {
    if (n.is_read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    try {
      await api.markNotificationRead(n.id);
      announceNotificationsChanged();
    } catch {
      // roll back if the server refused
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: false } : x)));
    }
  };

  const markAllRead = async () => {
    const previous = items;
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    try {
      await api.markAllNotificationsRead();
      announceNotificationsChanged();
    } catch {
      setItems(previous);
    }
  };

  const open = async (n: NotificationItem) => {
    await markRead(n);
    const target = targetFor(n.notification_type);
    if (target !== "/dashboard/notifications") navigate(target);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("notifications")}
        description={unreadCount > 0 ? `${unreadCount} ${t("unread", "unread")}` : undefined}
        icon={<FiBell className="h-6 w-6" />}
        action={
          unreadCount > 0 ? (
            <button type="button" onClick={markAllRead} className="btn-secondary inline-flex items-center gap-2 text-sm">
              <FiCheckCircle className="h-4 w-4" /> {t("mark_all_read")}
            </button>
          ) : undefined
        }
      />

      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
          </div>
        ) : failed ? (
          <EmptyState
            icon={<FiBell className="h-8 w-8" />}
            title={t("something_went_wrong")}
            description={t("failed_to_load_data")}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FiBell className="h-8 w-8" />}
            title={t("no_notifications")}
            description={t("notifications_empty_desc", "You will see answers, event announcements and donation updates here.")}
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-muted/50 ${
                    n.is_read ? "" : "bg-primary/5"
                  }`}
                >
                  <span
                    className={`mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full ${n.is_read ? "bg-transparent" : "bg-primary"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm ${n.is_read ? "font-medium" : "font-semibold"} text-foreground`}>
                        {n.title}
                      </span>
                      <Badge variant={typeVariant[n.notification_type] || "default"}>
                        {t(`notification_type_${String(n.notification_type).toLowerCase()}`, String(n.notification_type))}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default DashboardNotifications;
