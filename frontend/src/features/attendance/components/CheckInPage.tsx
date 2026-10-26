// Student screen: /dashboard/check-in  (optional ?event=ID to preselect)
// Lists the open attendance sessions the student belongs to. For the chosen one the student scans the room QR
// shown by the organizer, or types its 6-digit code. Helpers find the organizer's scanner from here too.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiCamera, FiCheckCircle, FiHash } from "react-icons/fi";

import { Card, SectionHeader } from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { etDate, etTime } from "../../../lib/ethiopiaTime";
import { attendanceApi, AttendanceSession, ERROR_KEYS, parseRoomQr } from "../api";
import QrScanner from "./QrScanner";

export default function CheckInPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const wantedEvent = params.get("event");
  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [chosen, setChosen] = useState<AttendanceSession | null>(null);
  const [code, setCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await attendanceApi.openForMe();
      setSessions(list);
      if (!chosen) {
        const pre = wantedEvent ? list.find((s) => s.event?.id === Number(wantedEvent)) : undefined;
        setChosen(pre ?? (list.length === 1 ? list[0] : null));
      }
    } catch {
      setSessions([]);
    }
  }, [wantedEvent, chosen]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(
    async (sessionId: number, sixDigits: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await attendanceApi.selfCheckIn(sessionId, sixDigits);
        if (res.ok) {
          setMessage({ ok: true, text: res.already ? t("att_already", "Already checked in.") : t("checkin_done", "You are marked present. Welcome!") });
          setSessions((list) => (list ?? []).map((s) => (s.id === sessionId ? { ...s, checked_in: true } : s)));
          setChosen((s) => (s && s.id === sessionId ? { ...s, checked_in: true } : s));
        } else {
          setMessage({ ok: false, text: t(ERROR_KEYS[res.code ?? ""] ?? "att_err_generic", res.detail ?? "Something went wrong. Try again.") });
        }
      } catch (e: any) {
        if (e?.response?.status === 429) setMessage({ ok: false, text: t("checkin_too_many", "Too many tries. Wait a minute.") });
        else setMessage({ ok: false, text: t("att_err_generic", "Something went wrong. Try again.") });
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  const onDecoded = useCallback(
    (text: string) => {
      const room = parseRoomQr(text);
      if (!room) return;
      submit(room.sessionId, room.code);
    },
    [submit],
  );

  const label = (s: AttendanceSession) =>
    s.event ? `${s.event.title} · ${etDate(s.event.start_date)} ${etTime(s.event.start_date)}` : `${s.class_day?.course} · ${s.class_day ? etDate(s.class_day.date + "T00:00:00Z") : ""}`;

  return (
    <div className="space-y-4">
      <SectionHeader title={t("checkin_title", "Check in")} description={t("checkin_desc", "Scan the code on the organizer's screen, or type the 6 digits.")} icon={<FiCheckCircle className="h-6 w-6" />} />

      {sessions === null ? (
        <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState icon={<FiCamera className="h-10 w-10" />} title={t("checkin_none", "Nothing to check in to right now")} description={t("checkin_none_desc", "When an organizer opens attendance for one of your events or classes, it appears here.")} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t("checkin_badge_hint", "You can also show your badge at the door.")} <Link to="/dashboard/my-badge" className="text-primary hover:underline">{t("badge_title", "My badge")}</Link>
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t("checkin_choose", "Open now")}</p>
            <div className="space-y-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setChosen(s);
                    setMessage(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm transition ${chosen?.id === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="text-foreground">{label(s)}</span>
                  {s.checked_in && <span className="flex items-center gap-1 text-xs font-medium text-success"><FiCheckCircle className="h-4 w-4" /> {t("checkin_present", "Present")}</span>}
                </button>
              ))}
            </div>
          </Card>

          {chosen && chosen.checked_in && (
            <div className="card flex items-center gap-3 border-success/40 bg-success/5">
              <FiCheckCircle className="h-8 w-8 shrink-0 text-success" />
              <div>
                <p className="font-semibold text-foreground">{t("checkin_recorded", "Your attendance is recorded.")}</p>
                <p className="text-sm text-muted-foreground">{t("checkin_recorded_desc", "You are marked present. Nothing more to do.")}</p>
              </div>
            </div>
          )}

          {chosen && !chosen.checked_in && chosen.status === "OPEN" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                {cameraError ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("checkin_camera_failed", "The camera could not start. Type the 6 digits instead.")}</p>
                ) : (
                  <QrScanner onDecoded={onDecoded} onError={setCameraError} paused={busy} className="aspect-square w-full" />
                )}
              </Card>
              <Card>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.length === 6) submit(chosen.id, code);
                  }}
                  className="space-y-3"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground"><FiHash className="h-4 w-4" /> {t("checkin_code_label", "6-digit code on the screen")}</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="input w-full py-3 text-center font-mono text-3xl tracking-[0.4em]"
                    placeholder="000000"
                  />
                  <button type="submit" disabled={code.length !== 6 || busy} className="btn-primary w-full py-2 text-sm disabled:opacity-50">
                    {busy ? t("checkin_sending", "Sending...") : t("checkin_submit", "I am here")}
                  </button>
                </form>
              </Card>
            </div>
          )}

          {message && (
            <Card className={message.ok ? "border-success" : "border-destructive"}>
              <p className={`flex items-center gap-2 text-sm font-medium ${message.ok ? "text-success" : "text-destructive"}`}>
                {message.ok && <FiCheckCircle className="h-5 w-5" />} {message.text}
              </p>
            </Card>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        {t("checkin_helper_hint", "Helping at the door? Open the organizer's scanner:")}{" "}
        {sessions?.map((s) => (
          <Link key={s.id} to={s.event ? `/dashboard/attendance-scan?event=${s.event.id}` : `/dashboard/attendance-scan?class_day=${s.class_day?.id}`} className="mr-2 text-primary hover:underline">
            {s.event?.title ?? s.class_day?.course}
          </Link>
        ))}
      </p>
    </div>
  );
}
