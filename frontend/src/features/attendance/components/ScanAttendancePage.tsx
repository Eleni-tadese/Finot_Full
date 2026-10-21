// Organizer screen: /dashboard/attendance-scan?event=ID  or  ?class_day=UUID
// Opens (or joins) the attendance session for that target, then offers three tools:
//   Scan      : the camera reads student badges (or the badge text is typed), scans made offline wait in a queue
//   Room code : the big 6-digit code + QR for students who check in from their own phone
//   Helpers   : people from the roster who may also scan from their phones
// Closing marks everyone else absent; reopening lets a late student in. The server decides every permission.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { FiCamera, FiCheckCircle, FiHash, FiLock, FiRefreshCw, FiUnlock, FiUsers, FiWifi, FiWifiOff } from "react-icons/fi";

import axiosInstance from "../../../lib/axios";
import { Card, SectionHeader } from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import { etDate, etDateTime } from "../../../lib/ethiopiaTime";
import { attendanceApi, AttendanceSession, ERROR_KEYS, isBadge, ScanResult, Target } from "../api";
import { clearQueue, enqueue, isNetworkError, readQueue } from "../queue";
import QrScanner from "./QrScanner";

type Tool = "scan" | "code" | "helpers";
type RosterPerson = { id: number; name: string; email?: string };

export default function ScanAttendancePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const eventId = params.get("event");
  const classDayId = params.get("class_day");
  const target = useMemo<Target | null>(
    () => (eventId ? { event_id: Number(eventId) } : classDayId ? { course_session_id: classDayId } : null),
    [eventId, classDayId],
  );

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("scan");
  const [online, setOnline] = useState(navigator.onLine);

  // ---- open or join the session --------------------------------------------------------------------------
  useEffect(() => {
    if (!target) return;
    attendanceApi
      .open(target)
      .then(setSession)
      .catch((e) => {
        const code = e?.response?.data?.code as string | undefined;
        setError(t(code && ERROR_KEYS[code] ? ERROR_KEYS[code] : "att_err_cannot_open", "This attendance cannot be opened."));
      });
  }, [target, t]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const refresh = useCallback(() => {
    if (session) attendanceApi.session(session.id).then(setSession).catch(() => undefined);
  }, [session]);

  if (!target) return <p className="text-muted-foreground">{t("att_no_target", "Open this page from an event or a class day.")}</p>;
  if (error) return <Card><p className="text-destructive">{error}</p></Card>;
  if (!session) return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>;

  const title = session.event ? session.event.title : `${session.class_day?.course} · ${session.class_day ? etDate(session.class_day.date + "T00:00:00Z") : ""}`;
  const isOpen = session.status === "OPEN";

  const closeSession = async () => {
    if (!window.confirm(t("att_close_confirm", "Close attendance? Everyone not checked in becomes absent."))) return;
    try {
      const res = await attendanceApi.close(session.id);
      setSession(res);
      toast.success(t("att_closed_toast", "Closed. {{n}} marked absent.", { n: res.marked_absent }));
    } catch {
      toast.error(t("att_err_generic", "Something went wrong. Try again."));
    }
  };
  const reopenSession = async () => {
    try {
      setSession(await attendanceApi.reopen(session.id));
    } catch (e: any) {
      const code = e?.response?.data?.code;
      toast.error(t(ERROR_KEYS[code] ?? "att_err_generic", "Something went wrong. Try again."));
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("att_scan_title", "Scan attendance")}
        description={title}
        icon={<FiCamera className="h-6 w-6" />}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={online ? "success" : "warning"} size="sm">
              {online ? <FiWifi className="mr-1 inline h-3 w-3" /> : <FiWifiOff className="mr-1 inline h-3 w-3" />}
              {online ? t("att_online", "Online") : t("att_offline", "Offline")}
            </Badge>
            <Badge variant={isOpen ? "primary" : "default"} size="sm">{isOpen ? t("att_open", "Open") : t("att_closed", "Closed")}</Badge>
          </div>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-2xl font-semibold text-foreground">
            {session.present} <span className="text-base font-normal text-muted-foreground">/ {session.roster} {t("att_present_count", "present")}</span>
          </p>
          <button type="button" onClick={refresh} className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs">
            <FiRefreshCw className="h-3 w-3" /> {t("att_refresh", "Refresh")}
          </button>
          <div className="ml-auto flex gap-2">
            {isOpen ? (
              <button type="button" onClick={closeSession} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-sm">
                <FiLock className="h-4 w-4" /> {t("att_close_btn", "Close attendance")}
              </button>
            ) : (
              <button type="button" onClick={reopenSession} className="btn-outline flex items-center gap-1 px-3 py-1.5 text-sm">
                <FiUnlock className="h-4 w-4" /> {t("att_reopen_btn", "Reopen")}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("att_auto_close", "Closes by itself at {{when}} if you forget.", { when: etDateTime(session.auto_close_at) })}
          {" · "}
          <button type="button" onClick={() => navigate(-1)} className="text-primary hover:underline">{t("att_manual_link", "Back to the manual list")}</button>
        </p>
      </Card>

      <div className="flex gap-2">
        {([
          ["scan", FiCamera, t("att_tool_scan", "Scan badges")],
          ["code", FiHash, t("att_tool_code", "Room code")],
          ["helpers", FiUsers, t("att_tool_helpers", "Helpers")],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTool(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tool === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tool === "scan" && <ScanTool session={session} online={online} onCounts={(p, r) => setSession((s) => (s ? { ...s, present: p, roster: r } : s))} />}
      {tool === "code" && <RoomCodeTool session={session} />}
      {tool === "helpers" && <HelpersTool session={session} onChange={setSession} />}
    </div>
  );
}

// ---- Scan badges -------------------------------------------------------------------------------------------

function ScanTool({ session, online, onCounts }: { session: AttendanceSession; online: boolean; onCounts: (p: number, r: number) => void }) {
  const { t } = useTranslation();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [last, setLast] = useState<ScanResult | null>(null);
  const [queue, setQueue] = useState(() => readQueue(session.id));
  const [syncing, setSyncing] = useState(false);
  const recent = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const isOpen = session.status === "OPEN";

  const handle = useCallback(
    async (text: string) => {
      const now = Date.now();
      if (recent.current.text === text && now - recent.current.at < 3000) return; // the camera reads the same code many times a second
      recent.current = { text, at: now };
      if (!isBadge(text)) {
        setLast({ ok: false, code: "bad_badge" });
        return;
      }
      try {
        const res = await attendanceApi.scan(session.id, text);
        setLast(res);
        if (res.present !== undefined && res.roster !== undefined) onCounts(res.present, res.roster);
      } catch (e) {
        if (isNetworkError(e)) {
          setQueue(enqueue(session.id, text));
          setLast({ ok: true, code: "queued" });
        } else {
          setLast({ ok: false, code: "generic" });
        }
      }
    },
    [session.id, onCounts],
  );

  const sync = useCallback(async () => {
    const scans = readQueue(session.id);
    if (scans.length === 0) return;
    setSyncing(true);
    try {
      const res = await attendanceApi.sync(session.id, scans);
      clearQueue(session.id);
      setQueue([]);
      onCounts(res.present, res.roster);
      const refused = res.results.filter((r) => !r.ok);
      toast.success(t("att_synced", "{{n}} scans sent.", { n: res.accepted }));
      if (refused.length) toast.error(t("att_sync_refused", "{{n}} refused: {{names}}", { n: refused.length, names: refused.map((r) => r.student?.name ?? "?").join(", ") }), { duration: 8000 });
    } catch {
      toast.error(t("att_sync_failed", "Still no connection. The scans are kept."));
    } finally {
      setSyncing(false);
    }
  }, [session.id, onCounts, t]);

  useEffect(() => {
    if (online && queue.length > 0 && !syncing) sync();
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = (r: ScanResult) => {
    if (r.code === "queued") return t("att_queued", "Saved on this phone. It will be sent when the network is back.");
    if (r.ok) return r.already ? t("att_already", "Already checked in.") : t("att_welcome", "Present!");
    return t(ERROR_KEYS[r.code ?? ""] ?? "att_err_generic", r.detail ?? "Something went wrong. Try again.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        {!isOpen ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("att_err_closed", "Attendance is closed for this session.")}</p>
        ) : cameraError ? (
          <p className="text-sm text-muted-foreground">{t("att_camera_failed", "The camera could not start. Type the badge text below, or let the students type the room code.")}</p>
        ) : (
          <QrScanner onDecoded={handle} onError={setCameraError} className="aspect-square w-full" />
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) handle(typed.trim());
            setTyped("");
          }}
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("att_type_badge", "Badge text (FB1....)")} className="input w-full py-2 text-sm" disabled={!isOpen} />
          <button type="submit" className="btn-outline px-3 py-2 text-sm" disabled={!isOpen}>{t("att_mark", "Mark")}</button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className={last ? (last.ok ? "border-success" : "border-destructive") : ""}>
          {last ? (
            <div className="flex items-center gap-4">
              {last.student?.photo ? (
                <img src={last.student.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
                  {last.student?.name?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">{last.student?.name ?? t("att_unknown", "Unknown badge")}</p>
                <p className="text-sm text-muted-foreground">
                  {[last.student?.batch_year ? t("att_year_n", "Year {{n}}", { n: last.student.batch_year }) : null, last.student?.department].filter(Boolean).join(" · ")}
                </p>
                <p className={`mt-1 flex items-center gap-1 text-sm font-medium ${last.ok ? "text-success" : "text-destructive"}`}>
                  {last.ok && <FiCheckCircle className="h-4 w-4" />} {message(last)}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("att_point_camera", "Point the camera at a student's badge.")}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground">
              {queue.length === 0
                ? t("att_queue_empty", "No scans waiting.")
                : t("att_queue_n", "{{n}} scans waiting to be sent.", { n: queue.length })}
            </p>
            <button type="button" onClick={sync} disabled={queue.length === 0 || syncing} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-50">
              {syncing ? t("att_syncing", "Sending...") : t("att_sync_now", "Send now")}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("att_queue_hint", "Without network, scans are kept on this phone and sent later.")}</p>
        </Card>
      </div>
    </div>
  );
}

// ---- Room code ---------------------------------------------------------------------------------------------

function RoomCodeTool({ session }: { session: AttendanceSession }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<{ code: string; qr: string; seconds_left: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    const load = async () => {
      try {
        const c = await attendanceApi.code(session.id);
        if (!alive) return;
        setCode(c);
        setFailed(false);
        timer = window.setTimeout(load, Math.max(1, c.seconds_left) * 1000 + 300); // ask again when the window turns
      } catch {
        if (!alive) return;
        setFailed(true);
        timer = window.setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [session.id]);

  if (session.status !== "OPEN") return <Card><p className="py-8 text-center text-sm text-muted-foreground">{t("att_err_closed", "Attendance is closed for this session.")}</p></Card>;

  return (
    <Card className="text-center">
      <p className="text-sm text-muted-foreground">{t("att_code_hint", "Show this on a screen. Students open Finot > Check in and scan it or type the code.")}</p>
      {code ? (
        <>
          <div className="mx-auto my-4 w-fit rounded-xl bg-white p-4">
            <QRCodeSVG value={code.qr} size={240} />
          </div>
          <p className="font-mono text-5xl font-bold tracking-[0.3em] text-foreground">{code.code}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("att_code_changes", "The code changes every 30 seconds.")}</p>
        </>
      ) : failed ? (
        <p className="py-8 text-destructive">{t("att_code_failed", "Cannot reach the server for the code. Scan badges instead.")}</p>
      ) : (
        <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>
      )}
    </Card>
  );
}

// ---- Helpers -----------------------------------------------------------------------------------------------

function HelpersTool({ session, onChange }: { session: AttendanceSession; onChange: (s: AttendanceSession) => void }) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<RosterPerson[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = useMemo(() => new Set(session.helpers.map((h) => h.id)), [session.helpers]);

  useEffect(() => {
    // The roster of the target: the people who could help at the door.
    const load = async () => {
      try {
        if (session.event) {
          const r = await axiosInstance.get(`/api/service/events/${session.event.id}/roster/`);
          setPeople((r.data.students ?? []).map((s: any) => ({ id: s.id, name: s.name, email: s.email })));
        } else if (session.class_day) {
          const r = await axiosInstance.get(`/api/course/sessions/${session.class_day.id}/roster/`);
          setPeople((r.data.roster ?? []).map((s: any) => ({ id: s.student_id, name: `${s.first_name} ${s.last_name}`.trim(), email: s.username })));
        }
      } catch {
        toast.error(t("att_err_generic", "Something went wrong. Try again."));
      }
    };
    load();
  }, [session.event, session.class_day, t]);

  const toggle = async (id: number) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSaving(true);
    try {
      onChange(await attendanceApi.setHelpers(session.id, [...next]));
    } catch {
      toast.error(t("att_err_generic", "Something went wrong. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)).slice(0, 50);

  return (
    <Card>
      <p className="mb-3 text-sm text-muted-foreground">{t("att_helpers_hint", "Helpers may scan badges for this session from their own phone (Finot > Check in > Scan for the organizer). Tick them.")}</p>
      {session.helpers.length > 0 && (
        <p className="mb-3 text-sm text-foreground">{t("att_helpers_now", "Helpers now:")} {session.helpers.map((h) => h.name).join(", ")}</p>
      )}
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("evatt_search", "Search by name or email")} className="input mb-3 w-full py-2 text-sm sm:w-72" />
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} disabled={saving} className="h-4 w-4" />
            <span className="text-sm text-foreground">{p.name}</span>
            <span className="truncate text-xs text-muted-foreground">{p.email}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
