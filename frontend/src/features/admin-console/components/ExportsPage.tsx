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
    { path: "private-qa/", title: t("adm_exp_qa", "Private Q&A log"), desc: t("adm_exp_qa_d", "Private questions with who asked, who was assigned and the answers. Contains personal information.") },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("adm_exports_title", "Export to Excel")}
        description={t("adm_exports_desc", "Download any table as an Excel file. Course attendance reports are exported from each course's report page.")}
      />
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
