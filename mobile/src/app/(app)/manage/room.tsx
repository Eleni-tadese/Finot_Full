import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { brand, font } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiRequest } from '@/lib/api';
import { etDate, etTime } from '@/lib/ethiopia-time';
import { useSession } from '@/lib/session';
import type { OrganizerSession, RoomCode, ScanResult, ServiceEvent } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// The server's short error codes -> translation keys (the same list as the website).
const ERROR_KEYS: Record<string, string> = {
  bad_badge: 'att_err_bad_badge',
  old_badge: 'att_err_old_badge',
  not_on_roster: 'att_err_not_on_roster',
  closed: 'att_err_closed',
  forbidden: 'att_err_forbidden',
  another_open: 'att_err_another_open',
  not_yet: 'att_err_not_yet',
  ended: 'att_err_ended',
};

type Result = { ok: boolean; text: string };

// Step R2: take attendance for ONE event. Open the room, show the room code, scan student badges, close.
// Manual marking and the offline queue come in R2c; the server decides who may do all of this.
export default function ManageRoom() {
  const { t } = useTranslation();
  const { accessToken } = useSession();
  const { event: eventParam } = useLocalSearchParams<{ event?: string }>();
  const eventId = Number(eventParam);
  const event = useApi<ServiceEvent>(`/api/service/events/${eventId}/`);

  const [session, setSession] = useState<OrganizerSession | null>(null);
  const [stage, setStage] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [problem, setProblem] = useState('');
  const [code, setCode] = useState<RoomCode | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef({ data: '', at: 0 }); // the camera reports one QR many times a second: act once per few seconds

  // One place that turns a failed call into a sentence in the person's language.
  const explain = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError) {
        const body = (e.body ?? {}) as { code?: string; detail?: string };
        if (body.code && ERROR_KEYS[body.code]) return t(ERROR_KEYS[body.code]);
        return e.message;
      }
      return t('att_err_generic');
    },
    [t],
  );

  // 1. Is there already an open session for this event? 404 means "not yet".
  const loadSession = useCallback(async () => {
    setStage('loading');
    try {
      const current = await apiRequest<OrganizerSession>(`/api/attendance/sessions/current/?event_id=${eventId}`, { token: accessToken });
      setSession(current);
      setStage('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setStage('none');
      } else {
        setProblem(explain(e));
        setStage('error');
      }
    }
  }, [eventId, accessToken, explain]);
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // 2. While the session is open, ask for the room code again just before it changes (every 30 seconds).
  const open = session?.status === 'OPEN';
  const sessionId = session?.id;
  useEffect(() => {
    if (!open || !sessionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      let wait = 5;
      try {
        const next = await apiRequest<RoomCode>(`/api/attendance/sessions/${sessionId}/code/`, { token: accessToken });
        if (stopped) return;
        setCode(next);
        setSession((s) => (s ? { ...s, present: next.present, roster: next.roster } : s));
        wait = Math.max(2, next.seconds_left + 1);
      } catch {
        // a lost connection: try again soon, the old code simply stays on screen
      }
      if (!stopped) timer = setTimeout(tick, wait * 1000);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, sessionId, accessToken]);

  async function startSession() {
    setBusy(true);
    setResult(null);
    try {
      const opened = await apiRequest<OrganizerSession>('/api/attendance/sessions/open/', {
        method: 'POST',
        body: { event_id: eventId },
        token: accessToken,
      });
      setSession(opened);
      setStage('ready');
    } catch (e) {
      setResult({ ok: false, text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function scan(badge: string) {
    const now = Date.now();
    if (busy || !sessionId) return;
    if (badge === lastScan.current.data && now - lastScan.current.at < 4000) return;
    lastScan.current = { data: badge, at: now };
    setBusy(true);
    try {
      const res = await apiRequest<ScanResult>(`/api/attendance/sessions/${sessionId}/scan/`, {
        method: 'POST',
        body: { badge },
        token: accessToken,
      });
      const name = res.student?.name ?? '';
      if (res.already) {
        setResult({ ok: true, text: t('mng_scan_already', { name }) });
      } else {
        setResult({ ok: true, text: t('mng_scan_ok', { name }) });
        setSession((s) => (s ? { ...s, present: s.present + 1 } : s));
      }
    } catch (e) {
      // a refused badge comes back as 400 with {code, detail, student?}
      const body: Partial<ScanResult> = e instanceof ApiError ? ((e.body ?? {}) as ScanResult) : {};
      const name = body.student?.name;
      const reason = body.code && ERROR_KEYS[body.code] ? t(ERROR_KEYS[body.code]) : explain(e);
      setResult({ ok: false, text: name ? `${name}: ${reason}` : reason });
    } finally {
      setBusy(false);
    }
  }

  function confirmClose() {
    Alert.alert(t('mng_close'), t('mng_close_confirm'), [
      { text: t('mng_cancel'), style: 'cancel' },
      { text: t('mng_close'), style: 'destructive', onPress: closeSession },
    ]);
  }

  async function closeSession() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const closed = await apiRequest<OrganizerSession & { marked_absent: number }>(`/api/attendance/sessions/${sessionId}/close/`, {
        method: 'POST',
        token: accessToken,
      });
      setSession(closed);
      setCode(null);
      setResult({ ok: true, text: t('mng_closed_done', { n: closed.marked_absent }) });
    } catch (e) {
      setResult({ ok: false, text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function reopenSession() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const reopened = await apiRequest<OrganizerSession>(`/api/attendance/sessions/${sessionId}/reopen/`, { method: 'POST', token: accessToken });
      setSession(reopened);
      setResult(null);
    } catch (e) {
      setResult({ ok: false, text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  if (event.loading && !event.data) return <LoadingView />;
  if (event.error && !event.data) return <ErrorView message={event.error.message} onRetry={event.retry} />;
  const ev = event.data;
  const percent = session && session.roster > 0 ? Math.round((session.present / session.roster) * 100) : 0;

  return (
    <Screen title={ev?.title ?? t('mng_room_title')} subtitle={ev ? `${etDate(ev.start_date)} · ${etTime(ev.start_date)}` : undefined}>
      {stage === 'loading' ? <LoadingView /> : null}
      {stage === 'error' ? <ErrorView message={problem} onRetry={loadSession} /> : null}

      {stage === 'none' ? (
        <Card style={styles.centerCard}>
          <MaterialIcons name="meeting-room" size={40} color={brand.primary} />
          <AppText color={brand.muted} style={styles.center}>
            {t('mng_not_started')}
          </AppText>
          <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={startSession}>
            <AppText variant="bodyStrong" color="#ffffff">
              {t('mng_start')}
            </AppText>
          </Pressable>
        </Card>
      ) : null}

      {stage === 'ready' && session ? (
        <>
          <Card style={styles.gap}>
            <AppText variant="title" color={brand.primary}>
              {t('mng_present_count', { present: session.present, roster: session.roster })}
            </AppText>
            <ProgressBar percent={percent} />
          </Card>

          {open ? (
            <>
              <Card style={styles.cameraCard}>
                <AppText variant="label" color={brand.muted}>
                  {t('mng_scan_title')}
                </AppText>
                {permission?.granted ? (
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={busy ? undefined : ({ data }) => scan(data)}
                  />
                ) : (
                  <View style={styles.permission}>
                    <MaterialIcons name="photo-camera" size={36} color={brand.primary} />
                    <AppText color={brand.muted} style={styles.center}>
                      {t('mng_camera_why')}
                    </AppText>
                    <Pressable style={styles.button} onPress={requestPermission}>
                      <AppText variant="bodyStrong" color="#ffffff">
                        {t('m_allow_camera')}
                      </AppText>
                    </Pressable>
                  </View>
                )}
                <AppText variant="caption" color={brand.muted} style={styles.center}>
                  {t('mng_scan_hint')}
                </AppText>
              </Card>

              <Card style={styles.centerCard}>
                <AppText variant="label" color={brand.muted}>
                  {t('mng_room_code')}
                </AppText>
                {code ? (
                  <>
                    <View style={styles.qrBox}>
                      <QRCode value={code.qr} size={200} backgroundColor="#ffffff" color="#000000" />
                    </View>
                    <AppText style={styles.digits} color={brand.primary}>
                      {code.code}
                    </AppText>
                  </>
                ) : (
                  <LoadingView />
                )}
                <AppText variant="caption" color={brand.muted} style={styles.center}>
                  {t('mng_room_code_hint')}
                </AppText>
              </Card>
            </>
          ) : (
            <Card style={styles.centerCard}>
              <MaterialIcons name="lock" size={32} color={brand.muted} />
              <AppText variant="bodyStrong">{t('mng_closed_state')}</AppText>
            </Card>
          )}

          {result ? (
            <Card style={[styles.message, { borderColor: result.ok ? brand.success : brand.danger }]}>
              <MaterialIcons name={result.ok ? 'check-circle' : 'error-outline'} size={24} color={result.ok ? brand.success : brand.danger} />
              <AppText variant="bodyStrong" color={result.ok ? brand.success : brand.danger} style={styles.messageText}>
                {result.text}
              </AppText>
            </Card>
          ) : null}

          {open ? (
            <Pressable style={[styles.dangerButton, busy && styles.disabled]} disabled={busy} onPress={confirmClose}>
              <AppText variant="bodyStrong" color={brand.danger}>
                {t('mng_close')}
              </AppText>
            </Pressable>
          ) : (
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={reopenSession}>
              <AppText variant="bodyStrong" color="#ffffff">
                {t('mng_reopen')}
              </AppText>
            </Pressable>
          )}
        </>
      ) : null}

      {stage === 'none' && result ? (
        <Card style={[styles.message, { borderColor: brand.danger }]}>
          <MaterialIcons name="error-outline" size={24} color={brand.danger} />
          <AppText variant="bodyStrong" color={brand.danger} style={styles.messageText}>
            {result.text}
          </AppText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  gap: { gap: 10 },
  centerCard: { alignItems: 'center', gap: 12 },
  cameraCard: { gap: 10, padding: 10 },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  permission: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  qrBox: { padding: 12, backgroundColor: '#ffffff', borderRadius: 12 },
  digits: { fontFamily: font.bold, fontSize: 40, letterSpacing: 8 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  dangerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: brand.danger,
    paddingVertical: 14,
    borderRadius: 14,
  },
  disabled: { opacity: 0.5 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5 },
  messageText: { flex: 1 },
});
