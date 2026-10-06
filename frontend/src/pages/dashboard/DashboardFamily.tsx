import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { etDateTime } from "../../lib/ethiopiaTime";
import { firstApiError } from "../../features/resources/utils";
import { Card } from "../../components/ui/Card";
import { Avatar } from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import { useTranslation } from "react-i18next";
import { FiUsers, FiPhone, FiMail, FiUser, FiSend, FiHome, FiCheckCircle, FiBookOpen, FiMessageCircle, FiLock } from "react-icons/fi";

type Contact = { id: number; name: string; email?: string; phone?: string | null };
type Child = {
  id: number; name: string; email?: string; phone?: string | null; year?: number | null; department?: string | null;
  dorm_block?: number | null; dorm_room?: number | null; section?: number | null; groups?: string[];
  event_attendance?: { present: number; absent: number };
  course_attendance?: { present: number; held: number; percentage: number | null };
};
type Msg = { id: number; body: string; created_at: string; sender: string | null; to: string | null; mine: boolean; to_parents: boolean };

const Line = ({ icon, text }: { icon: React.ReactNode; text?: string | null }) =>
  text ? <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">{icon}<span className="break-all">{text}</span></div> : null;

const Pill = ({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
    tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-white text-foreground"
  }`}>{children}</span>
);

const DashboardFamily = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [family, setFamily] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [to, setTo] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setFamily(await api.getMyFamily());
      setError(null);
    } catch (err: any) {
      setFamily(null);
      setError(err?.response?.status === 404 ? t("no_family_assigned") : t("failed_load_family"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // new messages show up without a refresh
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const res = await api.sendFamilyMessage(body, to);
      toast.success(t("fam_msg_sent", "Message sent to {{n}} person(s).", { n: res.told }));
      setBody("");
      await load();
    } catch (err: any) {
      toast.error(firstApiError(err?.response?.data) || err?.response?.data?.detail || t("adm_save_failed", "Could not save."));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="skeleton h-24 rounded-2xl" />))}</div>;
  }

  if (error || !family) {
    return (
      <div className="space-y-6">
        <Card><EmptyState icon={<FiUsers className="h-10 w-10" />} title={t("no_family_assigned")} description={error ?? ""} /></Card>
      </div>
    );
  }

  const isParent = family.my_role === "parent" || family.my_role === "manager";
  const children: Child[] = family.children ?? [];
  const siblings: (Contact & { year?: number | null; department?: string | null })[] = family.siblings ?? [];
  const messages: Msg[] = family.messages ?? [];
  const people = isParent ? children.length : siblings.length + 1;

  const parentCard = (label: string, data: Contact | null) => (
    <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
      <Avatar src={null} alt={data?.name || "?"} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-white/70">{label}</p>
        <p className="truncate text-base font-semibold text-white">{data?.name || t("fam_not_set", "Not set yet")}</p>
        {data?.phone && <p className="mt-0.5 flex items-center gap-2 text-sm text-white/80"><FiPhone className="h-3.5 w-3.5 shrink-0" />{data.phone}</p>}
        {data?.email && <p className="mt-0.5 flex items-center gap-2 text-sm text-white/80"><FiMail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{data.email}</span></p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Family banner */}
      <div className="overflow-hidden rounded-3xl bg-primary p-6 text-white shadow-soft">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white/15 p-3"><FiUsers className="h-6 w-6" /></div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{family.name}</h1>
            <p className="text-sm text-white/75">
              {isParent ? t("fam_parent_desc", "You are the father or mother of this family. Follow your children and write to them.") : t("spiritual_family_mentors")}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm">{t("fam_people_n", "{{n}} in the family", { n: people })}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {parentCard(t("father"), family.father)}
          {parentCard(t("mother"), family.mother)}
        </div>
        {family.religious_father && (
          <p className="mt-4 flex items-center gap-2 text-sm text-white/85"><FiUser className="h-4 w-4" />{t("religious_father")}: <strong>{family.religious_father}</strong></p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* People */}
        <div className="space-y-4 lg:col-span-3">
          <h2 className="text-base font-semibold text-foreground">
            {isParent ? t("fam_children_n", "Your children ({{n}})", { n: children.length }) : t("siblings_count", { count: siblings.length })}
          </h2>

          {isParent ? (
            children.length === 0 ? (
              <Card><p className="text-sm text-muted-foreground">{t("fam_no_children", "No students are in this family yet.")}</p></Card>
            ) : children.map((c) => {
              const absent = c.event_attendance?.absent ?? 0;
              const pct = c.course_attendance?.percentage;
              return (
                <Card key={c.id}>
                  <div className="flex items-start gap-3">
                    <Avatar src={null} alt={c.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.year ? <Pill>{t("fam_year_n", "Year {{n}}", { n: c.year })}</Pill> : null}
                      </div>
                      {c.department && <p className="text-sm text-muted-foreground">{c.department}</p>}
                      <Line icon={<FiPhone className="h-4 w-4 shrink-0" />} text={c.phone} />
                      <Line icon={<FiMail className="h-4 w-4 shrink-0" />} text={c.email} />
                      {(c.dorm_block || c.section) && (
                        <Line icon={<FiHome className="h-4 w-4 shrink-0" />} text={[c.dorm_block ? t("adm_block_n", { n: c.dorm_block }) : null, c.dorm_room ? `${t("fam_room", "Room")} ${c.dorm_room}` : null, c.section ? t("adm_section_n", { n: c.section }) : null].filter(Boolean).join(" · ")} />
                      )}
                      {c.groups && c.groups.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{c.groups.join(", ")}</p>}
                    </div>
                    <button type="button" onClick={() => { setTo(c.id); document.getElementById("family-composer")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                      className="btn-outline flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs"><FiMessageCircle className="h-3.5 w-3.5" />{t("fam_message_one", "Message")}</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-muted/50 p-2">
                    <Pill tone={absent > 0 ? "warn" : "good"}><FiCheckCircle className="h-3.5 w-3.5" />
                      {t("fam_events_att", "Events: {{p}} present, {{a}} absent", { p: c.event_attendance?.present ?? 0, a: absent })}
                    </Pill>
                    <Pill tone={pct == null ? "plain" : pct < 75 ? "warn" : "good"}><FiBookOpen className="h-3.5 w-3.5" />
                      {pct == null ? t("fam_courses_none", "Courses: no classes yet") : t("fam_courses_att", "Courses: {{n}}% attendance", { n: pct })}
                    </Pill>
                  </div>
                </Card>
              );
            })
          ) : siblings.length === 0 ? (
            <Card><p className="text-sm text-muted-foreground">{t("fam_no_siblings", "You have no brothers or sisters in this family yet.")}</p></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {siblings.map((s) => (
                <Card key={s.id}>
                  <div className="flex items-start gap-3">
                    <Avatar src={null} alt={s.name || "?"} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{s.name}</p>
                      <p className="text-sm text-muted-foreground">{[s.year ? t("fam_year_n", "Year {{n}}", { n: s.year }) : null, s.department].filter(Boolean).join(" · ") || t("student", "Student")}</p>
                      <Line icon={<FiPhone className="h-4 w-4 shrink-0" />} text={s.phone} />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Conversation */}
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-4">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-foreground"><FiMessageCircle className="h-5 w-5" />{t("fam_messages", "Family messages")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {isParent ? t("fam_write_hint", "Everyone gets it as a notification. Choose one child to write privately.") : t("fam_reply_hint", "You can answer your father and mother. Your brothers and sisters do not see your reply.")}
            </p>

            <div className="mb-3 max-h-[26rem] space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3">
              {messages.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("fam_no_messages", "No messages yet.")}</p>
              ) : [...messages].reverse().map((m) => (
                <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-white text-foreground shadow-sm"}`}>
                    {!m.mine && <p className="mb-0.5 text-xs font-semibold text-primary">{m.sender ?? "—"}</p>}
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                    <p className={`mt-1 flex items-center gap-1 text-[11px] ${m.mine ? "text-white/70" : "text-muted-foreground"}`}>
                      {(m.to || m.to_parents) && <FiLock className="h-3 w-3" />}
                      {m.to_parents ? t("fam_to_parents", "to the parents") : m.to ? t("fam_only_to", "only to {{name}}", { name: m.to }) : null}
                      {(m.to || m.to_parents) && " · "}{etDateTime(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <form id="family-composer" onSubmit={send} className="space-y-2">
              {isParent && (
                <select className="input w-full" value={to ?? ""} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : null)} aria-label={t("fam_to", "Send to")}>
                  <option value="">{t("fam_to_all", "Everyone in the family")}</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <textarea className="input min-h-[80px] w-full" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={isParent ? t("fam_msg_placeholder", "Your message...") : t("fam_reply_placeholder", "Write to your father and mother...")} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{body.length}/1000</span>
                <button type="submit" disabled={sending || !body.trim()} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                  <FiSend className="h-4 w-4" />{sending ? t("saving") : isParent ? t("fam_send", "Send") : t("fam_reply", "Reply")}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardFamily;
