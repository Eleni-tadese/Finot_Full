import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { AcademicCapIcon, CalendarDaysIcon, ChatBubbleLeftRightIcon, HeartIcon, SparklesIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import axiosInstance from "../../lib/axios";

interface Stats {
  active_students: number;
  graduates: number;
  service_groups: number;
  families: number;
  events: number;
  public_questions: number;
}

/** Live numbers from the platform itself. Nothing here is typed in by hand, so a young system shows small numbers honestly. */
const LiveStats = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    axiosInstance.get("/api/public/overview/").then((r) => setStats(r.data.stats)).catch(() => setStats(null));
  }, []);

  if (!stats) return null;

  const items = [
    { label: t("stats_students"), value: stats.active_students, icon: AcademicCapIcon },
    { label: t("stats_groups"), value: stats.service_groups, icon: UserGroupIcon },
    { label: t("stats_families", "Families"), value: stats.families, icon: SparklesIcon },
    { label: t("stats_events", "Events"), value: stats.events, icon: CalendarDaysIcon },
    { label: t("stats_questions", "Public questions"), value: stats.public_questions, icon: ChatBubbleLeftRightIcon },
    { label: t("stats_graduates_short", "Graduates"), value: stats.graduates, icon: HeartIcon },
  ];

  return (
    <section className="bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">{t("live_title", "The fellowship in numbers")}</h2>
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            {t("live_subtitle", "Live numbers from this platform")}
          </p>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-soft"
            >
              <item.icon className="mx-auto mb-2 h-6 w-6 text-accent" />
              <p className="text-3xl font-bold text-primary">{item.value.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{item.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LiveStats;
