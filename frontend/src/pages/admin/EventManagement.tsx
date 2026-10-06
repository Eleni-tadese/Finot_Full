import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { CalendarIcon } from "@heroicons/react/24/outline";
import EventsWorkspace from "../admin/components/EventsWorkspace";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

/** The Event Manager's page: announce general events, then take their attendance. */
const EventManagement = () => {
  const { t } = useTranslation();

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeIn}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <CalendarIcon className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">{t("em_page_title", "Events")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("em_page_desc", "Announce programs to everyone, like a channel: what it is, when, where and what to bring. Every student is told by notification and email. Take the attendance of each event in the Attendance tab.")}
        </p>
      </motion.div>

      <EventsWorkspace scope="mine" />
    </div>
  );
};

export default EventManagement;
