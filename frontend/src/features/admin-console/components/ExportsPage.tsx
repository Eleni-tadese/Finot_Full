import { useTranslation } from "react-i18next";
import { Card } from "../../../components/ui/Card";
import ExportButton from "../../export/components/ExportButton";
import { PageHeader } from "./AdminUi";

const ExportsPage = () => {
  const { t } = useTranslation();

  const items = [
    { path: "students/", title: t("adm_exp_students", "Students"), desc: t("adm_exp_students_d", "Every student with batch, department, dorm, section and phone.") },
    { path: "families/", title: t("adm_exp_families", "Families"), desc: t("adm_exp_families_d", "Families with their father, mother and members (two sheets).") },
    { path: "events/", title: t("adm_exp_events", "Events"), desc: t("adm_exp_events_d", "All events with date, place, status and creator.") },
    { path: "event-attendance/", title: t("adm_exp_att", "Event attendance"), desc: t("adm_exp_att_d", "Present / absent for every student at every event.") },
    { path: "donations/", title: t("adm_exp_donations", "Donations"), desc: t("adm_exp_donations_d", "Every donation from students and guests with fund, amount and status, plus totals. Filtered exports are on the Donations page.") },
    { path: "users/", title: t("adm_exp_users", "Users and roles"), desc: t("adm_exp_users_d", "Every account with its roles, year, department, stage and whether it came from a slip. No passwords.") },
    { path: "service-groups/", title: t("adm_exp_groups", "Service groups"), desc: t("adm_exp_groups_d", "Groups with their admin, members and the groups students chose (three sheets).") },
    { path: "courses/", title: t("adm_exp_courses", "Courses"), desc: t("adm_exp_courses_d", "Curriculums, semester courses, enrolments, class days and all course attendance (five sheets).") },
    { path: "public-qa/", title: t("adm_exp_pubqa", "Public Q&A"), desc: t("adm_exp_pubqa_d", "Public questions and their answers with approval status.") },
    { path: "materials/", title: t("adm_exp_materials", "Materials"), desc: t("adm_exp_materials_d", "Uploaded course and group materials with who added them.") },
    { path: "setup/", title: t("adm_exp_setup", "Departments, year changes and registrations"), desc: t("adm_exp_setup_d", "Departments, the yearly promotion history and the slip registration batches (three sheets).") },
    { path: "sms-log/", title: t("adm_exp_sms", "SMS log"), desc: t("adm_exp_sms_d", "The latest 5000 SMS messages with their status.") },
    { path: "private-qa/", title: t("adm_exp_qa", "Private Q&A log"), desc: t("adm_exp_qa_d", "Private questions with who asked, who was assigned and the answers. Contains personal information.") },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("adm_exports_title", "Export to Excel")}
        description={t("adm_exports_desc", "Download any table as an Excel file. Course attendance reports are exported from each course's report page.")}
      />
      <Card className="mb-4 flex flex-col justify-between gap-4 border-primary/40 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-foreground">{t("adm_exp_all", "Everything in one file")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("adm_exp_all_d", "One Excel file with every table above, one sheet each. Use it as a backup copy. Contains personal information: keep it safe.")}</p>
        </div>
        <div><ExportButton path="everything/" /></div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Card key={item.path} className="flex flex-col justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">{item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
            </div>
            <div><ExportButton path={item.path} /></div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExportsPage;
