import { useTranslation } from "react-i18next";
import EventsWorkspace from "../../../pages/admin/components/EventsWorkspace";
import { PageHeader } from "./AdminUi";

/** Super Admin: announce general events and take attendance for any event. */
const EventsAdminPage = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("adm_events_title", "Events")}
        description={t("adm_events_desc", "Announce general events to everyone, and take attendance for any event, general or a service group's. Event Managers do the same for their own events; Service Admins for their group's.")}
      />
      <EventsWorkspace scope="all" />
    </div>
  );
};

export default EventsAdminPage;
