import { useCallback, useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { api } from "../../../lib/api";
import axiosInstance from "../../../lib/axios";
import { useAuth } from "../../../context/AuthContext";
import ExportButton from "../../../features/export/components/ExportButton";
import { EventInsightsPanel } from "../../../features/attendance/components/AttendanceInsights";

type Scope = "mine" | "group" | "all";

interface Person {
  id: number;
  name: string;
  email: string;
  batch_year: number | null;
  department: string | null;
  status: "PRESENT" | "ABSENT" | null;
}

/**
 * Take attendance for ONE event at a time.
 *   mine  : an Event Manager takes it for the general events they made
 *   group : a Service Admin takes it for their group's events
 *   all   : the Super Admin takes it for any event
 * The list of people comes from the server (general event: every active in-campus student; group event: the members).
 */
export default function EventAttendanceManager({ scope, groupId }: { scope: Scope; groupId?: number }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [eventId, setEventId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [came, setCame] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [saving, setSaving] = useState(false);

  // events this person may take attendance for
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await api.getEvents();
        const mine = all.filter((e: any) => {
          if (scope === "all") return true;
          if (scope === "group") return e.service_group === groupId;
          return e.service_group === null && e.created_by === user?.id;
        });
        mine.sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1));
        if (!alive) return;
        setEvents(mine);
        const now = new Date();
        const current = mine.find((e: any) => new Date(e.start_date) <= now) ?? mine[0];
        if (current) setEventId(String(current.id));
      } catch {
        toast.error(t("failed_fetch_events"));
      } finally {
        if (alive) setLoadingEvents(false);
      }
    })();
    return () => { alive = false; };
  }, [scope, groupId, user?.id, t]);

  const loadPeople = useCallback(async (id: string) => {
    if (!id) { setPeople([]); return; }
    setLoadingPeople(true);
    try {
      const res = await axiosInstance.get(`/api/service/events/${id}/roster/`);
      const rows: Person[] = res.data.students;
      setPeople(rows);
      setCame(Object.fromEntries(rows.map((p) => [p.id, p.status === "PRESENT"])));
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t("failed_fetch_group_data"));
      setPeople([]);
    } finally {
      setLoadingPeople(false);
    }
  }, [t]);

  useEffect(() => { loadPeople(eventId); }, [eventId, loadPeople]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q)) : people;
  }, [people, search]);

  const cameCount = people.filter((p) => came[p.id]).length;
  const selected = events.find((e) => String(e.id) === eventId);

  const setAll = (value: boolean) => setCame(Object.fromEntries(people.map((p) => [p.id, value])));

  const save = async () => {
    if (!eventId || people.length === 0) return;
    setSaving(true);
    try {
      await axiosInstance.post("/api/service/attendance/mark/", {
        event_id: Number(eventId),
        attendances: people.map((p) => ({ student_id: p.id, status: came[p.id] ? "PRESENT" : "ABSENT", remark: "" })),
      });
      toast.success(t("attendance_recorded_success"));
      await loadPeople(eventId);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t("failed_save_event"));
    } finally {
      setSaving(false);
    }
  };

  if (loadingEvents) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    const key = scope === "mine" ? "evatt_none_mine" : scope === "group" ? "evatt_none_group" : "evatt_none_all";
    const fallback = scope === "mine"
      ? "You have not created an event yet. Create one in the Events tab, then come back here to take its attendance."
      : scope === "group"
        ? "Your group has no event yet. Create one in the Events tab, then come back here to take its attendance."
        : "There is no event yet.";
    return <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">{t(key, fallback)}</div>;
  }

  const when = (d: string) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }).format(new Date(d));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="evatt-event">{t("evatt_select", "Choose the event")}</label>
        <select
          id="evatt-event"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({when(e.start_date)}){scope === "all" ? ` · ${e.service_group_name || t("evatt_general", "General event")}` : ""}
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-2 text-xs text-muted-foreground">
            {selected.service_group
              ? t("evatt_group_note", "A group event: only the members of {{name}} are listed.", { name: selected.service_group_name })
              : t("evatt_general_note", "A general event: every active student is listed.")}
          </p>
        )}
      </div>

      <EventInsightsPanel scope={scope} groupId={groupId} compact />

      <div className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("evatt_search", "Search by name or email")}
            className="input w-full py-2 text-sm sm:w-64"
          />
          <span className="text-sm font-medium text-foreground sm:ml-2">{t("evatt_came", "{{n}} of {{m}} came", { n: cameCount, m: people.length })}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setAll(true)} className="btn-outline px-3 py-1.5 text-xs">{t("evatt_all_came", "Everyone came")}</button>
            <button type="button" onClick={() => setAll(false)} className="btn-outline px-3 py-1.5 text-xs">{t("evatt_nobody", "Nobody came")}</button>
            <ExportButton path={`event-attendance/?event=${eventId}`} className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs" />
            <Link to={`/dashboard/attendance-scan?event=${eventId}`} className="btn-primary px-3 py-1.5 text-xs">{t("att_scan_title", "Scan attendance")}</Link>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t("evatt_hint", "Tick the people who came. Everyone you leave unticked is saved as absent.")}</p>

        {loadingPeople ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
          </div>
        ) : people.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("evatt_empty_roster", "Nobody is on this event's list.")}</p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-muted/50">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={!!came[p.id]} onChange={(e) => setCame((prev) => ({ ...prev, [p.id]: e.target.checked }))} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.batch_year ? t("evatt_year", "Year {{n}}", { n: p.batch_year }) : "", p.department, p.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${came[p.id] ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {came[p.id] ? t("present", "Present") : t("absent", "Absent")}
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("rep_no_match", "No student matches your search.")}</li>}
          </ul>
        )}

        <button type="button" onClick={save} disabled={saving || loadingPeople || people.length === 0} className="btn-primary mt-4 w-full sm:w-auto sm:px-8">
          {saving ? t("saving", "Saving...") : t("evatt_save", "Save attendance")}
        </button>
      </div>
    </div>
  );
}
