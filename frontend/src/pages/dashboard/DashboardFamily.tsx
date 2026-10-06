import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { etDateTime } from "../../lib/ethiopiaTime";
import { firstApiError } from "../../features/resources/utils";
import { Card, SectionHeader } from "../../components/ui/Card";
import { Avatar, AvatarGroup } from "../../components/ui/Avatar";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import { useTranslation } from "react-i18next";
import { FiUsers, FiPhone, FiMail, FiUser, FiSend, FiHome, FiCheckCircle, FiBookOpen } from "react-icons/fi";

type Contact = { id: number; name: string; email?: string; phone?: string | null };
type Child = {
  id: number; name: string; email?: string; phone?: string | null; year?: number | null; department?: string | null;
  dorm_block?: number | null; dorm_room?: number | null; section?: number | null; groups?: string[];
  event_attendance?: { present: number; absent: number };
  course_attendance?: { present: number; held: number; percentage: number | null };
};
type Msg = { id: number; body: string; created_at: string; sender: string | null; to: string | null };

const ContactLine = ({ icon, text }: { icon: React.ReactNode; text?: string | null }) =>
  text ? <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">{icon}<span className="break-all">{text}</span></div> : null;

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
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (<div key={i} className="skeleton h-24 rounded-2xl" />))}
      </div>
    );
  }

  const isParent = family?.my_role === "parent" || family?.my_role === "manager";
  const children: Child[] = family?.children ?? [];
  const messages: Msg[] = family?.messages ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={family?.name ? `${t("my_family")}: ${family.name}` : t("my_family")}
        description={isParent ? t("fam_parent_desc", "You are the father or mother of this family. Follow your children and write to them.") : t("spiritual_family_mentors")}
        icon={<FiUsers className="h-6 w-6" />}
      />

      {error ? (
        <Card><EmptyState icon={<FiUsers className="h-10 w-10" />} title={t("no_family_assigned")} description={error} /></Card>
      ) : !family ? (
        <Card><div className="space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="skeleton h-20 rounded-xl" />))}</div></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: t("spiritual_father"), data: family.father as Contact | null, role: t("father") },
              { label: t("spiritual_mother"), data: family.mother as Contact | null, role: t("mother") },
            ].map((parent) => (
              <Card key={parent.label} className="border-l-4 border-l-primary">
                <div className="flex items-start gap-4">
                  <Avatar src={null} alt={parent.data?.name || "?"} size="lg" />
                  <div className="min-w-0 flex-1">
                    <Badge variant="primary" size="sm" className="mb-2">{parent.role}</Badge>
                    <h3 className="text-base font-medium text-foreground">{parent.data?.name || t("fam_not_set", "Not set yet")}</h3>
                    <ContactLine icon={<FiMail className="h-4 w-4 shrink-0" />} text={parent.data?.email} />
                    <ContactLine icon={<FiPhone className="h-4 w-4 shrink-0" />} text={parent.data?.phone} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {isParent && family.can_send && (
            <Card>
              <h3 className="mb-1 text-base font-medium text-foreground">{t("fam_write", "Write to your family")}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{t("fam_write_hint", "Everyone gets it as a notification. Choose one child to write privately.")}</p>
              <form onSubmit={send} className="space-y-3">
                <select className="input w-full sm:w-72" value={to ?? ""} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : null)} aria-label={t("fam_to", "Send to")}>
                  <option value="">{t("fam_to_all", "Everyone in the family")}</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea className="input min-h-[96px] w-full" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("fam_msg_placeholder", "Your message...")} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{body.length}/1000</span>
                  <button type="submit" disabled={sending || !body.trim()} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><FiSend className="h-4 w-4" />{sending ? t("saving") : t("fam_send", "Send")}</button>
                </div>
              </form>
            </Card>
          )}

          {isParent ? (
            <Card>
              <h3 className="mb-4 text-base font-medium text-foreground">{t("fam_children_n", "Your children ({{n}})", { n: children.length })}</h3>
              {children.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("fam_no_children", "No students are in this family yet.")}</p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {children.map((c) => (
                    <div key={c.id} className="rounded-xl bg-muted/50 p-4">
                      <div className="flex items-start gap-3">
                        <Avatar src={null} alt={c.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{c.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {[c.year ? t("fam_year_n", "Year {{n}}", { n: c.year }) : null, c.department].filter(Boolean).join(" · ") || "—"}
                          </p>
                          <ContactLine icon={<FiPhone className="h-4 w-4 shrink-0" />} text={c.phone} />
                          <ContactLine icon={<FiMail className="h-4 w-4 shrink-0" />} text={c.email} />
                          {(c.dorm_block || c.section) && (
                            <ContactLine icon={<FiHome className="h-4 w-4 shrink-0" />} text={[c.dorm_block ? t("adm_block_n", { n: c.dorm_block }) : null, c.dorm_room ? `${t("fam_room", "Room")} ${c.dorm_room}` : null, c.section ? t("adm_section_n", { n: c.section }) : null].filter(Boolean).join(" · ")} />
                          )}
                          {c.groups && c.groups.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{c.groups.join(", ")}</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-foreground"><FiCheckCircle className="h-3.5 w-3.5" />
                          {t("fam_events_att", "Events: {{p}} present, {{a}} absent", { p: c.event_attendance?.present ?? 0, a: c.event_attendance?.absent ?? 0 })}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-foreground"><FiBookOpen className="h-3.5 w-3.5" />
                          {c.course_attendance?.percentage == null ? t("fam_courses_none", "Courses: no classes yet") : t("fam_courses_att", "Courses: {{n}}% attendance", { n: c.course_attendance.percentage })}
                        </span>
                        {family.can_send && (
                          <button type="button" onClick={() => { setTo(c.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border border-border px-2.5 py-1 text-foreground hover:bg-white">{t("fam_message_one", "Message")}</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            family.siblings && family.siblings.length > 0 && (
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-medium text-foreground">{t("siblings_count", { count: family.siblings.length })}</h3>
                  <AvatarGroup avatars={family.siblings.slice(0, 5).map((sib: any) => ({ src: null, alt: sib.name || "?" }))} max={5} size="sm" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {family.siblings.map((s: Contact & { year?: number | null; department?: string | null }) => (
                    <div key={s.id} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                      <Avatar src={null} alt={s.name || "?"} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{[s.year ? t("fam_year_n", "Year {{n}}", { n: s.year }) : null, s.department].filter(Boolean).join(" · ") || t("student", "Student")}</p>
                        <ContactLine icon={<FiPhone className="h-4 w-4 shrink-0" />} text={s.phone} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          )}

          <Card>
            <h3 className="mb-3 text-base font-medium text-foreground">{t("fam_messages", "Family messages")}</h3>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("fam_no_messages", "No messages yet.")}</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li key={m.id} className="rounded-xl bg-muted/50 p-3">
                    <p className="whitespace-pre-line text-sm text-foreground">{m.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.sender ?? "—"} · {etDateTime(m.created_at)}{m.to ? ` · ${t("fam_only_to", "only to {{name}}", { name: m.to })}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {family.religious_father && (
            <Card className="border-l-4 border-l-accent">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-accent/10 p-3"><FiUser className="h-6 w-6 text-accent-foreground" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("religious_father")}</p>
                  <p className="text-base font-medium text-foreground">{family.religious_father}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardFamily;
