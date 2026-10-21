import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { brand, font } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiRequest } from '@/lib/api';
import { etDate, etTime, plainDate } from '@/lib/ethiopia-time';
import { useSession } from '@/lib/session';
import type { AttendanceSession, SelfCheckInResponse } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// The server's short error codes -> translation keys (the same list as the website).
const ERROR_KEYS: Record<string, string> = {
  not_on_roster: 'att_err_not_on_roster',
  closed: 'att_err_closed',
  wrong_code: 'att_err_wrong_code',
  forbidden: 'att_err_forbidden',
};

// The organizer's big QR says "FS1.<session id>.<6 digits>".
function parseRoomQr(text: string): { sessionId: number; code: string } | null {
  const m = /^FS1\.(\d+)\.(\d{6})$/.exec(text.trim());
  return m ? { sessionId: Number(m[1]), code: m[2] } : null;
}

// Check in: pick the open attendance session, then scan the code on the organizer's screen or type the 6 digits.
export default function CheckInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accessToken } = useSession();
  const { event: wantedEvent } = useLocalSearchParams<{ event?: string }>();
  const sessions = useApi<AttendanceSession[]>('/api/attendance/sessions/open-for-me/');
  const [chosen, setChosen] = useState<AttendanceSession | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef(0); // the camera reports the same QR many times a second: act once every few seconds

  // Pick the session for the event we came from, or the only open one.
  useEffect(() => {
    const list = sessions.data;
    if (!list || chosen) return;
    const wanted = wantedEvent ? list.find((s) => s.event?.id === Number(wantedEvent)) : undefined;
    setChosen(wanted ?? (list.length === 1 ? list[0] : null));
  }, [sessions.data, wantedEvent, chosen]);

  async function submit(sessionId: number, sixDigits: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiRequest<SelfCheckInResponse>(`/api/attendance/sessions/${sessionId}/self-check-in/`, {
        method: 'POST',
        body: { code: sixDigits },
        token: accessToken,
      });
      setDone((prev) => new Set(prev).add(sessionId));
      setMessage({ ok: true, text: res.already ? t('att_already') : t('checkin_done') });
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setMessage({ ok: false, text: t('checkin_too_many') });
      } else if (e instanceof ApiError && (e.status === 400 || e.status === 409)) {
        // a refused check-in comes back as 400/409 with {"code": "...", "detail": "..."}
        const body = (e.body ?? {}) as { code?: string; detail?: string };
        setMessage({ ok: false, text: body.code && ERROR_KEYS[body.code] ? t(ERROR_KEYS[body.code]) : body.detail ?? t('att_err_generic') });
      } else {
        setMessage({ ok: false, text: e instanceof ApiError ? e.message : t('att_err_generic') });
      }
    } finally {
      setBusy(false);
    }
  }

  function onScanned(data: string) {
    const now = Date.now();
    if (busy || now - lastScan.current < 3000) return;
    const room = parseRoomQr(data);
    if (!room) return;
    lastScan.current = now;
    submit(room.sessionId, room.code);
  }

  const label = (s: AttendanceSession) =>
    s.event
      ? `${s.event.title} · ${etDate(s.event.start_date)} ${etTime(s.event.start_date)}`
      : `${s.class_day?.course ?? ''} · ${s.class_day ? plainDate(s.class_day.date) : ''}`;

  if (sessions.loading && !sessions.data) {
    return (
      <Screen title={t('checkin_title')}>
        <LoadingView />
      </Screen>
    );
  }
  if (sessions.error && !sessions.data) {
    return (
      <Screen title={t('checkin_title')}>
        <ErrorView message={sessions.error.message} onRetry={sessions.retry} />
      </Screen>
    );
  }

  const list = sessions.data ?? [];
  const checkedIn = chosen ? chosen.checked_in || done.has(chosen.id) : false;

  return (
    <Screen title={t('checkin_title')} subtitle={t('checkin_desc')} onRefresh={sessions.reload} refreshing={sessions.refreshing}>
      {list.length === 0 ? (
        <Card>
          <EmptyView icon="qr-code-scanner" message={t('checkin_none')} />
          <AppText variant="caption" color={brand.muted} style={styles.center}>
            {t('checkin_none_desc')}
          </AppText>
          <Pressable style={styles.link} onPress={() => router.push('/events/badge')}>
            <AppText variant="bodyStrong" color={brand.primary}>
              {t('checkin_badge_hint')} {t('badge_title')}
            </AppText>
          </Pressable>
        </Card>
      ) : (
        <>
          <Card style={styles.sessions}>
            <AppText variant="label" color={brand.muted}>
              {t('checkin_choose')}
            </AppText>
            {list.map((s) => {
              const active = chosen?.id === s.id;
              const present = s.checked_in || done.has(s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setChosen(s);
                    setMessage(null);
                  }}
                  style={[styles.session, active && styles.sessionActive]}>
                  <AppText variant={active ? 'bodyStrong' : 'body'} style={styles.sessionText} numberOfLines={2}>
                    {label(s)}
                  </AppText>
                  {present ? <MaterialIcons name="check-circle" size={22} color={brand.success} /> : null}
                </Pressable>
              );
            })}
          </Card>

          {chosen && !checkedIn ? (
            <>
              <Card style={styles.cameraCard}>
                {permission?.granted ? (
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={busy ? undefined : ({ data }) => onScanned(data)}
                  />
                ) : (
                  <View style={styles.permission}>
                    <MaterialIcons name="photo-camera" size={36} color={brand.primary} />
                    <AppText color={brand.muted} style={styles.center}>
                      {t('m_camera_why')}
                    </AppText>
                    <Pressable style={styles.button} onPress={requestPermission}>
                      <AppText variant="bodyStrong" color="#ffffff">
                        {t('m_allow_camera')}
                      </AppText>
                    </Pressable>
                  </View>
                )}
                <AppText variant="caption" color={brand.muted} style={styles.center}>
                  {t('m_scan_room_qr')}
                </AppText>
              </Card>

              <Card style={styles.codeCard}>
                <AppText variant="label" color={brand.muted}>
                  {t('checkin_code_label')}
                </AppText>
                <TextInput
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor={brand.muted}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.button, (code.length !== 6 || busy) && styles.buttonDisabled]}
                  disabled={code.length !== 6 || busy}
                  onPress={() => submit(chosen.id, code)}>
                  <AppText variant="bodyStrong" color="#ffffff">
                    {busy ? t('checkin_sending') : t('checkin_submit')}
                  </AppText>
                </Pressable>
              </Card>
            </>
          ) : null}

          {message ? (
            <Card style={[styles.message, { borderColor: message.ok ? brand.success : brand.danger }]}>
              <MaterialIcons name={message.ok ? 'check-circle' : 'error-outline'} size={24} color={message.ok ? brand.success : brand.danger} />
              <AppText variant="bodyStrong" color={message.ok ? brand.success : brand.danger} style={styles.messageText}>
                {message.text}
              </AppText>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  link: { alignItems: 'center', paddingTop: 8 },
  sessions: { gap: 8 },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 12,
  },
  sessionActive: { borderColor: brand.primary, backgroundColor: brand.primarySoft },
  sessionText: { flex: 1 },
  cameraCard: { gap: 10, padding: 10 },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  permission: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  codeCard: { gap: 10 },
  input: {
    fontFamily: font.bold,
    fontSize: 32,
    letterSpacing: 10,
    textAlign: 'center',
    color: brand.text,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: brand.background,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5 },
  messageText: { flex: 1 },
});
