import { useState } from "react";
import { useTranslation } from "react-i18next";
import GroupEventsManager from "./GroupEventsManager";
import EventAttendanceManager from "./EventAttendanceManager";

/**
 * The page of whoever announces general events: two tabs, the events themselves and their attendance.
 * Event Manager: their own general events. Super Admin: every event.
 */
export default function EventsWorkspace({ scope }: { scope: "mine" | "all" }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"events" | "attendance">("events");

  const tabButton = (key: "events" | "attendance", label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-xl bg-muted/60 p-1">
        {tabButton("events", t("em_tab_events", "Events"))}
        {tabButton("attendance", t("em_tab_attendance", "Attendance"))}
      </div>
      {tab === "events" ? <GroupEventsManager eventType="global" /> : <EventAttendanceManager scope={scope} />}
    </div>
  );
}
