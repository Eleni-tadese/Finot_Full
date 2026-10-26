import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, Vibration, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ProgressBar } from '@/components/ui/progress-bar';
import { brand, font } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiRequest } from '@/lib/api';
import { etDate, etTime, etToday, plainDate } from '@/lib/ethiopia-time';
import { hasRole, ROLES } from '@/lib/roles';
import { useSession } from '@/lib/session';
import type { OrganizerSession, RoomCode, RosterPerson, ScanResult, ServiceEvent } from '@/lib/types';
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
  not_today: 'att_err_not_today',
};

type Result = { ok: boolean; text: string };
const TABS = [
  { key: 'scan', label: 'mng_tab_scan', icon: 'qr-code-scanner' },
  { key: 'code', label: 'mng_tab_code', icon: 'pin' },
  { key: 'people', label: 'mng_tab_people', icon: 'groups' },
] as const;
type Filter = 'all' | 'present' | 'not_yet';
const PAGE = 40; // rows shown at a time, so a long list stays fast

// Take attendance for ONE event (?event=<id>) or ONE class day (?session=<uuid>&title=&date=&course=).
// Open the room, show the room code, scan student badges, mark by hand, close. The server decides who may do all of this.
export default function ManageRoom() {
  const { t } = useTranslation();
  const { accessToken, user } = useSession();
  const { event: eventParam, session: classParam, title: titleParam, date: dateParam, course: courseParam } = useLocalSearchParams<{
    event?: string;
    session?: string;
    title?: string;
    date?: string;
    course?: string;
  }>();
  const isClass = !!classParam;
  const eventId = Number(eventParam);
  const target = isClass ? `course_session_id=${classParam}` : `event_id=${eventId}`; // what the attendance API is asked about
  const event = useApi<ServiceEvent>(isClass ? null : `/api/service/events/${eventId}/`);

  const [session, setSession] = useState<OrganizerSession | null>(null);
  const [stage, setStage] = useState<'loading' | 'none' | 'ready' | 'error'>('loading');
  const [problem, setProblem] = useState('');
  const [code, setCode] = useState<RoomCode | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<RosterPerson[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [tab, setTab] = useState<'scan' | 'code' | 'people'>('scan');
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
      const current = await apiRequest<OrganizerSession>(`/api/attendance/sessions/current/?${target}`, { token: accessToken });
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
  }, [target, accessToken, explain]);
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

  // The people invited to this event and what is marked for each, from the same list the website uses.
  const loadRoster = useCallback(async () => {
    try {
      if (!isClass) {
        const res = await apiRequest<{ students: RosterPerson[] }>(`/api/service/events/${eventId}/roster/`, { token: accessToken });
        setPeople(res.students);
        return;
      }
      // a class day: the roster has today's mark; the course report has each student's standing (regular / at risk / never)
      type ClassRow = { student_id: number; display_name: string; email: string; status: 'PRESENT' | 'ABSENT' | null };
      const [roster, report] = await Promise.all([
        apiRequest<{ roster: ClassRow[] }>(`/api/course/sessions/${classParam}/roster/`, { token: accessToken }),
        courseParam
          ? apiRequest<{ students: { student_id: number; standing: string }[] }>(`/api/course/semester-courses/${courseParam}/attendance-report/`, { token: accessToken }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const standing = new Map((report?.students ?? []).map((r) => [r.student_id, r.standing]));
      setPeople(
        roster.roster.map((r) => ({
          id: r.student_id,
          name: r.display_name,
          email: r.email,
          batch_year: null,
          department: null,
          status: r.status,
          method: null,
          standing: standing.get(r.student_id),
        })),
      );
    } catch {
      // keep the list we already have; the count above still works
    }
  }, [eventId, isClass, classParam, courseParam, accessToken]);
  useEffect(() => {
    if (stage !== 'ready' && stage !== 'none') return;
    loadRoster();
    if (!open) return;
    const timer = setInterval(loadRoster, 15000); // picks up students who checked in with the room code
    return () => clearInterval(timer);
  }, [stage, open, loadRoster]);

  // Mark one person by hand (the same save as the website's Mark attendance).
  // `previous` makes the server keep a newer mark instead of overwriting it.
  async function mark(person: RosterPerson, status: 'PRESENT' | 'ABSENT') {
    setBusy(true);
    try {
      if (isClass) {
        await apiRequest(`/api/course/attendance/bulk-mark/${classParam}/`, {
          method: 'POST',
          body: { records: [{ student_id: person.id, status }] },
          token: accessToken,
        });
        await loadRoster();
        return;
      }
      const res = await apiRequest<{ conflicts?: number[] }>('/api/service/attendance/mark/', {
        method: 'POST',
        body: { event_id: eventId, attendances: [{ student_id: person.id, status, remark: '', previous: person.status }] },
        token: accessToken,
      });
      if (res.conflicts && res.conflicts.length > 0) {
        setResult({ ok: false, text: t('mng_changed_meanwhile', { name: person.name }) });
      }
      await loadRoster();
    } catch (e) {
      setResult({ ok: false, text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    setBusy(true);
    setResult(null);
    try {
      const opened = await apiRequest<OrganizerSession>('/api/attendance/sessions/open/', {
        method: 'POST',
        body: isClass ? { course_session_id: classParam } : { event_id: eventId },
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
      Vibration.vibrate(120); // a short buzz: the scan was read
      if (res.already) {
        setResult({ ok: true, text: t('mng_scan_already', { name }) });
      } else {
        setResult({ ok: true, text: t('mng_scan_ok', { name }) });
        setSession((s) => (s ? { ...s, present: s.present + 1 } : s));
        loadRoster();
      }
    } catch (e) {
      // a refused badge comes back as 400 with {code, detail, student?}
      const body: Partial<ScanResult> = e instanceof ApiError ? ((e.body ?? {}) as ScanResult) : {};
      const name = body.student?.name;
      const reason = body.code && ERROR_KEYS[body.code] ? t(ERROR_KEYS[body.code]) : explain(e);
      Vibration.vibrate([0, 150, 100, 150]); // two buzzes: refused
      setResult({ ok: false, text: name ? `${name}: ${reason}` : reason });
    } finally {
      setBusy(false);
    }
  }

  function confirmClose() {
    Alert.alert(t('mng_close'), t('mng_close_confirm_new'), [
      { text: t('mng_cancel'), style: 'cancel' },
      { text: t('mng_close'), style: 'destructive', onPress: closeSession },
    ]);
  }

  async function closeSession() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const closed = await apiRequest<OrganizerSession & { marked_absent: number; final?: boolean }>(`/api/attendance/sessions/${sessionId}/close/`, {
        method: 'POST',
        token: accessToken,
      });
      setSession(closed);
      setCode(null);
      // closing while the event still runs only stops the scanning: the Absent marks come when the event is over
      setResult({ ok: true, text: closed.final === false ? t('mng_closed_early') : t('mng_closed_done', { n: closed.marked_absent }) });
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

  if (!isClass && event.loading && !event.data) return <LoadingView />;
  if (!isClass && event.error && !event.data) return <ErrorView message={event.error.message} onRetry={event.retry} />;
  const ev = isClass ? null : event.data;
  const today = etToday();
  const liveToday = !isClass || dateParam === today; // a class day goes live only on its own date (the server says the same)
  const activeTab = open ? tab : 'people';
  // Reopening has the server's time limit: until 2 hours after the event ends (OPEN_BEFORE/auto-close in backend attendance/rules.py)
  // The Super Admin is not limited by it (same as the server).
  const eventOver = !isClass && !!ev && !hasRole(user, ROLES.superAdmin) && Date.now() > new Date(ev.end_date).getTime() + 2 * 60 * 60 * 1000;
  const reopenBlocked = eventOver || (isClass && !liveToday); // the server's limits, hidden here to keep the screen honest
  const needle = query.trim().toLowerCase();
  const matches = people.filter(
    (p) =>
      (filter === 'all' || (filter === 'present' ? p.status === 'PRESENT' : p.status !== 'PRESENT')) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.email ?? '').toLowerCase().includes(needle)),
  );
  const presentCount = people.filter((p) => p.status === 'PRESENT').length;
  const percent = session && session.roster > 0 ? Math.round((session.present / session.roster) * 100) : 0;

  const peopleCard = (
          <Card style={styles.gap}>
            <AppText variant="heading">{t('mng_roster_title')}</AppText>
            <AppText variant="caption" color={brand.muted}>
              {t('mng_roster_hint')}
            </AppText>
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setLimit(PAGE);
              }}
              placeholder={t('mng_search')}
              placeholderTextColor={brand.muted}
              style={styles.search}
            />
            <View style={styles.filters}>
              {(['all', 'present', 'not_yet'] as Filter[]).map((f) => {
                const n = f === 'all' ? people.length : f === 'present' ? presentCount : people.length - presentCount;
                return (
                  <Pressable
                    key={f}
                    onPress={() => {
                      setFilter(f);
                      setLimit(PAGE);
                    }}
                    style={[styles.filterChip, filter === f && styles.filterChipActive]}>
                    <AppText variant="caption" color={filter === f ? '#ffffff' : brand.primary}>
                      {t(f === 'all' ? 'mng_filter_all' : f === 'present' ? 'mng_filter_present' : 'mng_filter_not_yet')} ({n})
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {matches.slice(0, limit).map((p) => (
              <View key={p.id} style={styles.person}>
                <View style={styles.personText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </AppText>
                  <AppText variant="caption" color={brand.muted} numberOfLines={1}>
                    {isClass ? p.email : [p.batch_year ? t('evatt_year', { n: p.batch_year }) : '', p.department].filter(Boolean).join(' · ')}
                  </AppText>
                  <View style={styles.chips}>
                    <Chip text={p.status === 'PRESENT' ? t('mng_filter_present') : t('mng_filter_not_yet')} tone={p.status === 'PRESENT' ? 'green' : 'grey'} />
                    {p.standing === 'regular' ? <Chip text={t('mng_standing_regular')} tone="green" /> : null}
                    {p.standing === 'at_risk' ? <Chip text={t('mng_standing_at_risk')} tone="amber" /> : null}
                    {p.standing === 'never' ? <Chip text={t('mng_standing_never')} tone="red" /> : null}
                    {p.status === 'PRESENT' && p.method === 'BADGE' ? <Chip text={t('mng_scanned')} tone="blue" /> : null}
                    {p.status === 'PRESENT' && p.method === 'CODE' ? <Chip text={t('mng_code')} tone="blue" /> : null}
                  </View>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => mark(p, p.status === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                  style={[styles.markButton, p.status === 'PRESENT' && styles.markButtonUndo, busy && styles.disabled]}>
                  <AppText variant="caption" color={p.status === 'PRESENT' ? brand.danger : '#ffffff'}>
                    {p.status === 'PRESENT' ? t('mng_mark_absent') : t('mng_mark_present')}
                  </AppText>
                </Pressable>
              </View>
            ))}
            {matches.length === 0 ? (
              <AppText color={brand.muted} style={styles.center}>
                {t('mng_no_people')}
              </AppText>
            ) : null}
            {matches.length > limit ? (
              <Pressable style={styles.showMore} onPress={() => setLimit((n) => n + PAGE)}>
                <AppText variant="bodyStrong" color={brand.primary}>
                  {t('mng_show_more')}
                </AppText>
              </Pressable>
            ) : null}
          </Card>
  );

  return (
    <Screen
      title={isClass ? (titleParam ?? t('mng_room_title')) : (ev?.title ?? t('mng_room_title'))}
      subtitle={isClass ? (dateParam ? plainDate(dateParam) : undefined) : ev ? `${etDate(ev.start_date)} · ${etTime(ev.start_date)}` : undefined}>
      {stage === 'loading' ? <LoadingView /> : null}
      {stage === 'error' ? <ErrorView message={problem} onRetry={loadSession} /> : null}

      {stage === 'none' ? (
        <Card style={styles.centerCard}>
          <MaterialIcons name="meeting-room" size={40} color={brand.primary} />
          <AppText color={brand.muted} style={styles.center}>
            {t('mng_not_started')}
          </AppText>
          {liveToday ? (
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={startSession}>
              <AppText variant="bodyStrong" color="#ffffff">
                {t('mng_start')}
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="caption" color={brand.muted} style={styles.center}>
              {t('mng_live_today_only')}
            </AppText>
          )}
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

          {result ? (
            <Card style={[styles.message, { borderColor: result.ok ? brand.success : brand.danger }]}>
              <MaterialIcons name={result.ok ? 'check-circle' : 'error-outline'} size={24} color={result.ok ? brand.success : brand.danger} />
              <AppText variant="bodyStrong" color={result.ok ? brand.success : brand.danger} style={styles.messageText}>
                {result.text}
              </AppText>
            </Card>
          ) : null}

          {open ? (
            <View style={styles.tabs}>
              {TABS.map((item) => {
                const active = activeTab === item.key;
                return (
                  <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tabItem, active && styles.tabItemActive]}>
                    <MaterialIcons name={item.icon} size={20} color={active ? '#ffffff' : brand.primary} />
                    <AppText variant="caption" color={active ? '#ffffff' : brand.primary}>
                      {t(item.label)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {open && activeTab === 'scan' ? (
              <Card style={styles.cameraCard}>
                <AppText variant="label" color={brand.muted}>
                  {t('mng_scan_title')}
                </AppText>
                {permission?.granted ? (
                  <View style={styles.cameraBox}>
                    <CameraView
                      style={styles.camera}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={busy ? undefined : ({ data }) => scan(data)}
                    />
                    {/* A frame to aim with: the scan is automatic, there is nothing to tap */}
                    <View pointerEvents="none" style={styles.frameWrap}>
                      <View style={styles.frame} />
                    </View>
                  </View>
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
                <AppText variant="caption" color={brand.muted} style={styles.center}>
                  {t('mng_scan_auto')}
                </AppText>
              </Card>
          ) : null}

          {open && activeTab === 'code' ? (
              <Card style={styles.centerCard}>
                <AppText variant="label" color={brand.muted}>
                  {t('mng_room_code')}
                </AppText>
                {code ? (
                  <>
                    <View style={styles.qrBox}>
                      <QRCode value={code.qr} size={240} backgroundColor="#ffffff" color="#000000" />
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
          ) : null}

          {!open ? (
            <Card style={styles.centerCard}>
              <MaterialIcons name="lock" size={32} color={brand.muted} />
              <AppText variant="bodyStrong">{t('mng_closed_state')}</AppText>
            </Card>
          ) : null}

          {/* The people invited to this event: who came, who not yet, and a button to mark by hand */}
          {activeTab === 'people' ? peopleCard : null}

          {open ? (
            <Pressable style={[styles.dangerButton, busy && styles.disabled]} disabled={busy} onPress={confirmClose}>
              <AppText variant="bodyStrong" color={brand.danger}>
                {t('mng_close')}
              </AppText>
            </Pressable>
          ) : reopenBlocked ? (
            <AppText variant="caption" color={brand.muted} style={styles.center}>
              {t(isClass ? 'mng_class_over_note' : 'mng_over_note')}
            </AppText>
          ) : (
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={reopenSession}>
              <AppText variant="bodyStrong" color="#ffffff">
                {t('mng_reopen')}
              </AppText>
            </Pressable>
          )}
        </>
      ) : null}

      {stage === 'none' && people.length > 0 ? (
        <>
          <Card style={styles.gap}>
            <AppText variant="title" color={brand.primary}>
              {t('mng_present_count', { present: presentCount, roster: people.length })}
            </AppText>
            <ProgressBar percent={people.length > 0 ? Math.round((presentCount / people.length) * 100) : 0} />
          </Card>
          {peopleCard}
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
  cameraBox: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  camera: { width: '100%', height: '100%' },
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '62%', aspectRatio: 1, borderRadius: 16, borderWidth: 4, borderColor: brand.accent },
  tabs: { flexDirection: 'row', gap: 8 },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: brand.primary,
  },
  tabItemActive: { backgroundColor: brand.primary },
  search: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    color: brand.text,
    backgroundColor: brand.background,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: brand.primary },
  filterChipActive: { backgroundColor: brand.primary },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: brand.border },
  personText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  markButton: { backgroundColor: brand.primary, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  markButtonUndo: { backgroundColor: 'transparent', borderWidth: 1, borderColor: brand.danger },
  showMore: { alignItems: 'center', paddingVertical: 10 },
  permission: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  qrBox: { padding: 12, backgroundColor: '#ffffff', borderRadius: 12 },
  // lineHeight larger than the font size, otherwise the bottom of the digits is cut off
  digits: { fontFamily: font.bold, fontSize: 44, lineHeight: 60, letterSpacing: 8, textAlign: 'center' },
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
