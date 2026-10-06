import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface PersonCard {
  id: number;
  full_name: string;
  email: string;
  gender: "M" | "F" | null;
  is_active: boolean;
  date_joined: string;
  batch_year: number | null;
  department: string;
  student_status: "IN_CAMPUS" | "GRADUATED" | null;
  dorm_block: number | null;
  dorm_room: number | null;
  section: number | null;
  personal_phone: string;
  telegram_username: string;
  previous_church: string;
  activity_serving: string;
  service_group: string | null;
  family: string | null;
  roles: string[];
  full: boolean;
  // only in the Super Admin's full card
  emergency_name?: string;
  emergency_phone?: string;
  emergency_relation?: string;
  home_address?: string;
  confession_father?: string;
  sms_opt_in?: boolean;
  // only when a group admin opens someone who chose their group
  choice?: { priority: number; skills: string; reason: string } | null;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 py-1.5 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="col-span-2 break-words text-foreground">{children || <span className="text-muted-foreground">—</span>}</dd>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-t border-border pt-3">
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    <dl>{children}</dl>
  </section>
);

/** The body of the "student information" window. The parent decides who may see what by choosing the loader. */
const StudentCard = ({ load }: { load: () => Promise<PersonCard> }) => {
  const { t } = useTranslation();
  const [card, setCard] = useState<PersonCard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then((c) => alive && setCard(c)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [load]);

  if (failed) return <p className="py-8 text-center text-sm text-muted-foreground">{t("adm_load_failed", "Could not load this page. Please try again.")}</p>;
  if (!card) return <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>;

  const gender = card.gender === "M" ? t("flt_male", "Male") : card.gender === "F" ? t("flt_female", "Female") : "";
  const stage = card.student_status === "GRADUATED" ? t("usr_stage_graduated", "Graduated") : card.student_status ? t("usr_stage_student", "Student") : "";
  const roleLabel = (r: string) => t(`role_${r}`, r);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 pb-1">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">{initials(card.full_name)}</span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">{card.full_name}</p>
          <p className="truncate text-sm text-muted-foreground">{card.email}</p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {stage && <span className="rounded-lg bg-primary/10 px-2 py-0.5 font-medium text-primary">{stage}</span>}
            {card.batch_year && <span className="rounded-lg bg-muted px-2 py-0.5 text-muted-foreground">{t("flt_batch_n", "Batch {{n}}", { n: card.batch_year })}</span>}
            {card.department && <span className="rounded-lg bg-muted px-2 py-0.5 text-muted-foreground">{card.department}</span>}
            {!card.is_active && <span className="rounded-lg bg-red-100 px-2 py-0.5 text-red-700">{t("adm_inactive", "Inactive")}</span>}
          </div>
        </div>
      </div>

      {card.choice && (
        <Section title={t("sp_choice", "What they wrote when choosing")}>
          <Row label={t("mem_priority", "Choice {{n}}", { n: card.choice.priority })}>{t("sp_priority_hint", "their priority for your group")}</Row>
          <Row label={t("mem_skills", "Skills")}>{card.choice.skills}</Row>
          <Row label={t("mem_reason", "Why")}>{card.choice.reason}</Row>
        </Section>
      )}

      <Section title={t("sp_contact", "How to reach them")}>
        <Row label={t("sp_phone", "Phone")}>{card.personal_phone}</Row>
        <Row label={t("sp_telegram", "Telegram")}>{card.telegram_username}</Row>
        <Row label={t("sp_gender", "Gender")}>{gender}</Row>
      </Section>

      <Section title={t("sp_dorm", "Dorm")}>
        <Row label={t("flt_dorm", "Dorm block")}>{card.dorm_block}</Row>
        <Row label={t("sp_room", "Room")}>{card.dorm_room}</Row>
        <Row label={t("flt_section", "Section")}>{card.section}</Row>
      </Section>

      <Section title={t("sp_serving", "Service and family")}>
        <Row label={t("flt_group", "Service group")}>{card.service_group}</Row>
        <Row label={t("flt_family", "Family")}>{card.family}</Row>
        <Row label={t("sp_activity", "Serves in church as")}>{card.activity_serving}</Row>
        <Row label={t("sp_church", "Previous church")}>{card.previous_church}</Row>
        {card.roles.length > 0 && <Row label={t("adm_roles", "Roles")}>{card.roles.map(roleLabel).join(", ")}</Row>}
        <Row label={t("sp_joined", "Joined the platform")}>{new Date(card.date_joined).toLocaleDateString()}</Row>
      </Section>

      {card.full && (
        <Section title={t("sp_private", "Private information")}>
          <Row label={t("sp_emergency", "Emergency contact")}>{[card.emergency_name, card.emergency_relation].filter(Boolean).join(" · ")}</Row>
          <Row label={t("sp_emergency_phone", "Emergency phone")}>{card.emergency_phone}</Row>
          <Row label={t("sp_home", "Home address")}>{card.home_address}</Row>
          <Row label={t("sp_confession", "Confession father")}>{card.confession_father}</Row>
          <Row label={t("sp_sms", "SMS messages")}>{card.sms_opt_in ? t("sp_yes", "Agreed") : t("sp_no", "Not agreed")}</Row>
        </Section>
      )}
    </div>
  );
};

export default StudentCard;
