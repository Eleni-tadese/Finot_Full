import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiArrowLeft, FiCalendar, FiClock, FiExternalLink, FiMapPin, FiMessageCircle, FiUser, FiUsers } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { ServiceGroup } from "../../types";
import { Card } from "../../components/ui/Card";
import GroupPhoto from "../../features/service-groups/components/GroupPhoto";
import { lines, toEmbedUrl } from "../../features/service-groups/video";

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-6">
    <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
    {children}
  </div>
);

const ServiceGroupDetail = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<ServiceGroup | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getServiceGroupById(id).then(setGroup).catch((err: any) => setError(err?.message || t("group_not_found"))).finally(() => setLoading(false));
    // The group's own upcoming events (real data)
    api.getEvents()
      .then((all) => setEvents(all.filter((e: any) => String(e.service_group) === String(id) && e.status !== "COMPLETED").slice(0, 3)))
      .catch(() => setEvents([]));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
        <span className="ml-3 text-sm text-muted-foreground">{t("loading")}...</span>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive mb-4">{error || t("group_not_found")}</p>
        <Link to="/dashboard/service" className="btn-primary text-sm">{t("back_to_services")}</Link>
      </div>
    );
  }

  const activities = lines(group.activities);
  const embed = group.video_url ? toEmbedUrl(group.video_url) : null;
  const hasInfo = group.description || activities.length > 0 || group.requirements || group.commitment || group.contact_info || group.video_url;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/dashboard/service" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition hover:text-primary/80">
        <FiArrowLeft className="h-4 w-4" /> {t("back_to_services")}
      </Link>

      <motion.div initial="hidden" animate="visible" variants={fadeIn}>
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col md:flex-row">
            <div className="relative h-56 shrink-0 bg-muted sm:h-72 md:h-auto md:min-h-[22rem] md:w-2/5">
              <GroupPhoto photo={group.photo} name={group.name} className="absolute inset-0 h-full w-full" />
            </div>

            <div className="flex flex-1 flex-col p-6 md:p-8">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">{group.name}</h1>
              {group.summary && <p className="mt-2 text-muted-foreground">{group.summary}</p>}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                {group.admin_name && <span className="inline-flex items-center gap-1.5"><FiUser className="h-4 w-4" />{t("admin")}: {group.admin_name}</span>}
                <span className="inline-flex items-center gap-1.5"><FiUsers className="h-4 w-4" />{t("group_members_n", "{{n}} member(s)", { n: group.member_count ?? 0 })}</span>
                {group.commitment && <span className="inline-flex items-center gap-1.5"><FiClock className="h-4 w-4" />{group.commitment}</span>}
              </div>

              {!hasInfo && (
                <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {t("group_no_info_yet", "This group has not added its information yet. Ask its admin if you want to know more.")}
                </p>
              )}

              {group.description && (
                <Section title={t("group_about", "About this group")}>
                  <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{group.description}</p>
                </Section>
              )}

              {activities.length > 0 && (
                <Section title={t("group_what_we_do", "What members do")}>
                  <ul className="space-y-1.5">
                    {activities.map((a) => (
                      <li key={a} className="flex items-start text-muted-foreground"><span className="mr-3 mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />{a}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {group.requirements && (
                <Section title={t("group_who_should_join", "Who should join")}>
                  <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{group.requirements}</p>
                </Section>
              )}

              {group.contact_info && (
                <Section title={t("group_contact", "Questions? Ask")}>
                  <p className="inline-flex items-center gap-2 text-muted-foreground"><FiMessageCircle className="h-4 w-4" />{group.contact_info}</p>
                </Section>
              )}

              {group.video_url && (
                <Section title={t("videos")}>
                  {embed ? (
                    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border">
                      <iframe src={embed} title={group.name} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                    </div>
                  ) : (
                    <a href={group.video_url} target="_blank" rel="noreferrer noopener" className="btn-outline inline-flex items-center gap-2 text-sm">
                      <FiExternalLink className="h-4 w-4" />{t("group_watch_video", "Watch the video")}
                    </a>
                  )}
                </Section>
              )}

              {events.length > 0 && (
                <Section title={t("group_upcoming_events")}>
                  <ul className="space-y-2">
                    {events.map((e) => (
                      <li key={e.id} className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                        <p className="font-medium text-foreground">{e.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><FiCalendar className="h-3.5 w-3.5" />{new Date(e.start_date).toLocaleDateString()}</span>
                          {e.place_name && <span className="inline-flex items-center gap-1"><FiMapPin className="h-3.5 w-3.5" />{e.place_name}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <div className="mt-8 pt-2 md:mt-auto">
                <button onClick={() => navigate("/dashboard/service/select")} className="btn-primary w-full sm:w-auto">{t("select_this_group")}</button>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default ServiceGroupDetail;
