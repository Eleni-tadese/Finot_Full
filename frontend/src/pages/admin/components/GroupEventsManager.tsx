import React, { useState, useEffect, useRef } from "react";
import { etDateTime, etNow } from "../../../lib/ethiopiaTime";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import PhotoFrame from "../../../components/ui/PhotoFrame";
import ExpandableText from "../../../components/ui/ExpandableText";
import { api } from "../../../lib/api";
import { PlusIcon, MapPinIcon, TrashIcon, PhotoIcon, PencilIcon, XMarkIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import toast from "react-hot-toast";
import { useAuth } from "../../../context/AuthContext";
import { hasRole } from "../../../features/auth/roles";
import ExportButton from "../../../features/export/components/ExportButton";

interface EventFormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  place_name: string;
  place_url: string;
  audience_years: number[];
  audience_gender: "" | "M" | "F";
  audience_departments: string[];
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  place_name: "",
  place_url: "",
  audience_years: [],
  audience_gender: "",
  audience_departments: [],
};

/** "Year 1, 2 · Women · Software Engineering", or "" when the event is for everyone. */
export function audienceLabel(e: { audience_years?: number[]; audience_gender?: string; audience_departments?: string[] }, t: TFunction): string {
  const parts: string[] = [];
  if (e.audience_years && e.audience_years.length) parts.push(t("ev_aud_year_n", "Year {{n}}", { n: [...e.audience_years].sort().join(", ") }));
  if (e.audience_gender === "F") parts.push(t("ev_aud_women", "Women"));
  if (e.audience_gender === "M") parts.push(t("ev_aud_men", "Men"));
  if (e.audience_departments && e.audience_departments.length) parts.push(e.audience_departments.join(", "));
  return parts.join(" · ");
}

type StatusFilter = "ALL" | "UPCOMING" | "ONGOING" | "COMPLETED";

interface GroupEventsManagerProps {
  groupId?: number | null;
  eventType: "global" | "group";  // NEW: Controls whether service_group is sent
}

export default function GroupEventsManager({ groupId, eventType }: GroupEventsManagerProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { user } = useAuth();
  
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [formData, setFormData] = useState<EventFormData>({ ...emptyForm });
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    import("../../../lib/axios").then(({ default: axiosInstance }) =>
      axiosInstance.get("/api/student/departments/").then((r) => setDepartments(r.data)).catch(() => setDepartments([])),
    );
  }, []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const formRef = useRef<HTMLFormElement>(null);

  // Check if user can edit/delete an event
  const canEditEvent = (event: any) => {
    // SuperAdmin can edit any event
    if (hasRole(user, "Super_admin")) {
      return true;
    }
    
    // EventManager can only edit events they created (the list is already limited to them)
    if (hasRole(user, "Event_manager") && event.created_by === user?.id) {
      return true;
    }
    
    // ServiceAdmin can only edit events belonging to their group
    if (hasRole(user, "service_admin")) {
      // If event has a service_group and it matches the admin's group
      if (event.service_group && groupId && event.service_group === groupId) {
        return true;
      }
      // If event has no service_group (global event), ServiceAdmin cannot edit
      return false;
    }
    
    return false;
  };

  useEffect(() => {
    fetchEvents();
  }, [groupId]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      // The backend already filters events for this admin (global + managed group).
      // We show ALL events the admin can see — not just group-filtered ones —
      // because some events may have been created before the group was assigned.
      // An Event Manager who is nothing else sees only their own events (the server enforces the same rule)
      const ownEventsOnly = hasRole(user, "Event_manager") && !hasRole(user, "Super_admin", "service_admin");
      const data = ownEventsOnly ? await api.getMyEvents() : await api.getEvents();
      setEvents(data || []);
    } catch (err) {
      toast.error(t("failed_fetch_events"));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setPhotoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
    }
  };

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setPhotoFile(null);
    setPhotoPreview(null);
    setEditingEventId(null);
    setShowForm(false);
  };

  const startEdit = (event: any) => {
    setEditingEventId(event.id);
    setFormData({
      title: event.title || "",
      description: event.description || "",
      start_date: event.start_date ? event.start_date.slice(0, 16) : "",
      end_date: event.end_date ? event.end_date.slice(0, 16) : "",
      place_name: event.place_name || "",
      place_url: event.place_url || "",
      audience_years: event.audience_years || [],
      audience_gender: event.audience_gender || "",
      audience_departments: event.audience_departments || [],
    });
    setPhotoPreview(event.photo || null);
    setPhotoFile(null);
    setShowForm(true);
    // bring the form into view (the page scrolls inside the dashboard, so window.scrollTo does nothing)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", formData.title);
      fd.append("description", formData.description);
      fd.append("start_date", formData.start_date);
      fd.append("end_date", formData.end_date || formData.start_date);
      if (formData.place_name) fd.append("place_name", formData.place_name);
      if (formData.place_url) fd.append("place_url", formData.place_url);
      // the audience lists travel as JSON text inside the form data (the server parses them)
      fd.append("audience_years", JSON.stringify(formData.audience_years));
      fd.append("audience_gender", formData.audience_gender);
      fd.append("audience_departments", JSON.stringify(formData.audience_departments));
      if (photoFile) fd.append("photo", photoFile);
      
      // ONLY add service_group if eventType is "group" AND groupId exists
      if (eventType === "group" && groupId) {
        fd.append("service_group", groupId.toString());
      }

      const { default: axiosInstance } = await import("../../../lib/axios");

      if (editingEventId) {
        await axiosInstance.patch(`/api/service/events/${editingEventId}/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success(t("event_updated_success"));
      } else {
        await axiosInstance.post("/api/service/events/", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success(t("event_created_success"));
      }

      resetForm();
      fetchEvents();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const errors = err.response?.data;
      let msg = t("failed_save_event");
      
      // Handle 403 Forbidden specifically
      if (err.response?.status === 403) {
        msg = t("no_permission_to_modify_event");
      } else if (detail) {
        msg = detail;
      } else if (errors && typeof errors === 'object') {
        const firstKey = Object.keys(errors)[0];
        if (firstKey && Array.isArray(errors[firstKey])) {
          msg = `${firstKey}: ${errors[firstKey][0]}`;
        }
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (eventId: number) => {
    if (!(await confirm(t("delete_question_confirm")))) return;
    try {
      const { default: axiosInstance } = await import("../../../lib/axios");
      await axiosInstance.delete(`/api/service/events/${eventId}/`);
      toast.success(t("event_deleted_success"));
      fetchEvents();
    } catch (err: any) {
      // Handle 403 Forbidden specifically
      if (err.response?.status === 403) {
        toast.error(t("no_permission_to_delete_event"));
      } else {
        toast.error(t("failed_delete_event"));
      }
    }
  };

  // Apply status filter
  const filteredEvents = statusFilter === "ALL"
    ? events
    : events.filter((e) => e.status === statusFilter);

  // Determine title based on event type
  const pageTitle = eventType === "global" ? t("global_events") : t("group_events");
  const createButtonText = eventType === "global" ? t("create_global_event") : t("create_group_event");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">{pageTitle}</h2>
        <div className="flex gap-2 flex-wrap">
          {eventType === "global" && <ExportButton path="events/" />}
        <button
          onClick={() => {
            if (showForm) { resetForm(); } else { setShowForm(true); }
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {showForm ? (
            <><XMarkIcon className="h-4 w-4" /> {t("cancel")}</>
          ) : (
            <><PlusIcon className="h-4 w-4" /> {createButtonText}</>
          )}
        </button>
        </div>
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="bg-card p-6 rounded-xl border border-border shadow-soft space-y-4">
          <h3 className="font-semibold text-lg text-foreground">
            {editingEventId ? t("edit_event") : (eventType === "global" ? t("new_global_event") : t("new_group_event"))}
          </h3>
          
          {/* Info message about event visibility */}
          {eventType === "global" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              {t("global_event_info")}
            </div>
          )}
          {eventType === "group" && (
            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg text-sm text-purple-700 dark:text-purple-300">
              {t("group_event_info")}
            </div>
          )}
          
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t("ev_time_hint", "Type the times as Ethiopian time. It is now {{now}} in Ethiopia.", { now: etNow() })}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("title")} *</label>
              <input type="text" name="title" required value={formData.title} onChange={handleChange} placeholder={t("ev_title_ph", "e.g. Fellowship day, Christmas program")}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("start_date_time")} *</label>
              <input type="datetime-local" name="start_date" required value={formData.start_date} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("end_date_time")}</label>
              <input type="datetime-local" name="end_date" value={formData.end_date} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("place_name_opt")}</label>
              <input type="text" name="place_name" value={formData.place_name} onChange={handleChange} placeholder={t("ui_place_example")}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t("maps_url_opt")}</label>
              <input type="url" name="place_url" value={formData.place_url} onChange={handleChange} placeholder="https://maps.google.com/..."
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">{t("description")}</label>
              <textarea name="description" rows={5} value={formData.description} onChange={handleChange} placeholder={t("ev_desc_ph", "What is the program? Who should come? What to bring or wear? Who is speaking? Everything people need to know is told to them by notification and email.")}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">{t("ev_audience", "Who is it for? (optional)")}</p>
              <p className="mb-3 text-xs text-muted-foreground">{t("ev_audience_hint", "Leave everything empty for everyone. Otherwise only the matching students are told, listed for attendance and see the event.")}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("ev_aud_years", "Years of study")}</p>
                  <div className="flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5].map((y) => {
                      const on = formData.audience_years.includes(y);
                      return (
                        <button key={y} type="button" onClick={() => setFormData({ ...formData, audience_years: on ? formData.audience_years.filter((v) => v !== y) : [...formData.audience_years, y].sort() })}
                          className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-white" : "border-border bg-background text-foreground"}`}>{y}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("ev_aud_gender", "Gender")}</p>
                  <select value={formData.audience_gender} onChange={(e) => setFormData({ ...formData, audience_gender: e.target.value as "" | "M" | "F" })} className="input w-full py-1.5 text-sm">
                    <option value="">{t("ev_aud_everyone", "Everyone")}</option>
                    <option value="F">{t("ev_aud_women", "Women")}</option>
                    <option value="M">{t("ev_aud_men", "Men")}</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("ev_aud_departments", "Departments or stages")}</p>
                  {departments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("ev_aud_no_departments", "No departments in the list yet.")}</p>
                  ) : (
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
                      {departments.map((d) => (
                        <label key={d.id} className="flex items-center gap-2 text-xs text-foreground">
                          <input type="checkbox" className="h-3.5 w-3.5" checked={formData.audience_departments.includes(d.name)}
                            onChange={(e) => setFormData({ ...formData, audience_departments: e.target.checked ? [...formData.audience_departments, d.name] : formData.audience_departments.filter((n) => n !== d.name) })} />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {audienceLabel(formData, t) && <p className="mt-2 text-xs text-foreground">{t("ev_aud_summary", "This event is for: {{who}}", { who: audienceLabel(formData, t) })}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">{t("event_image_opt")}</label>
              <div className="mt-1 flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground transition hover:bg-muted/50">
                  <PhotoIcon className="h-5 w-5" />
                  <span>{photoFile ? photoFile.name : t("choose_image")}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
                {photoPreview && (
                  <img src={photoPreview} alt={t("ui_preview")} className="h-16 w-16 rounded-lg object-cover border border-border" />
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={resetForm} className="btn-outline text-sm">{t("cancel")}</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? `${t("saving")}...` : editingEventId ? t("update_event") : t("save_event")}
            </button>
          </div>
        </form>
      )}

      {/* Status Filter Tabs */}
      {!loading && events.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <FunnelIcon className="h-4 w-4 text-muted-foreground" />
          {(["ALL", "UPCOMING", "ONGOING", "COMPLETED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "ALL" ? t("all") : t("event_" + s.toLowerCase())}
              {s !== "ALL" && (
                <span className="ml-1 opacity-70">
                  ({events.filter((e) => e.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center shadow-soft text-muted-foreground">
          {events.length === 0 ? t("no_events_created") : t("no_events_match")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => (
            <div key={event.id} className="rounded-xl border border-border bg-card shadow-soft overflow-hidden flex flex-col">
              {event.photo && (
                <PhotoFrame src={event.photo} alt={event.title} zoom className="h-44 w-full" />
              )}
              <div className="p-5 flex-1 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-semibold text-lg line-clamp-1" title={event.title}>{event.title}</h3>
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                    event.status === 'UPCOMING' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    event.status === 'ONGOING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {t("event_" + event.status.toLowerCase())}
                  </span>
                </div>
                <p className="text-sm text-foreground">
                  {etDateTime(event.start_date)}
                </p>
                {event.service_group_name && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded bg-accent/20 text-accent-foreground font-medium">
                    {event.service_group_name} {t("group")}
                  </span>
                )}
                {audienceLabel(event, t) && (
                  <p className="text-xs text-muted-foreground">{t("ev_aud_for", "For: {{who}}", { who: audienceLabel(event, t) })}</p>
                )}
                {(event.place_name || event.place_url) && (
                  <div className="flex flex-col gap-1 p-2 bg-muted/50 rounded-lg">
                    {event.place_name && (
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <MapPinIcon className="h-4 w-4 text-primary" />
                        <span>{event.place_name}</span>
                      </div>
                    )}
                    {event.place_url && (
                      <a href={event.place_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary-light ml-5 underline underline-offset-2">
                        {t("view_on_map")}
                      </a>
                    )}
                  </div>
                )}
                {event.description && (
                  <div className="text-sm text-muted-foreground"><ExpandableText text={event.description} lines={3} /></div>
                )}
              </div>
              <div className="bg-muted/30 px-5 py-3 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                <span>{t("by")} {event.created_by_name}</span>
                {canEditEvent(event) && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(event)}
                      className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title={t("edit_event")}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title={t("delete_event")}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}