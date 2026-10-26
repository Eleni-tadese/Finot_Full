import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DateField } from '@/components/ui/date-field';
import { brand, font } from '@/constants/brand';
import { apiRequest, friendlyError } from '@/lib/api';
import { addDaysYmd, datesOnWeekdays } from '@/lib/calendar';
import { etToday, plainDate } from '@/lib/ethiopia-time';
import { useSession } from '@/lib/session';
import { useTranslation } from 'react-i18next';

// Plan many class days at once, like the website: pick the weekdays the class meets and a period, untick the dates that
// will not happen (a holiday, an exam), add one-off dates, then create them all. The server skips days that already exist.
export default function PlanDays() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accessToken } = useSession();
  const { course, title } = useLocalSearchParams<{ course: string; title?: string }>();

  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [from, setFrom] = useState(etToday());
  const [to, setTo] = useState(addDaysYmd(etToday(), 7 * 15));
  const [extras, setExtras] = useState<string[]>([]);
  const [extra, setExtra] = useState(etToday());
  const [off, setOff] = useState<string[]>([]);
  const [teacher, setTeacher] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dates = useMemo(() => {
    const found = new Set<string>([...extras, ...datesOnWeekdays(from, to, weekdays)]);
    return Array.from(found).sort();
  }, [from, to, weekdays, extras]);
  const chosen = dates.filter((d) => !off.includes(d));

  const toggleWeekday = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));
  const toggleDate = (d: string) => setOff((o) => (o.includes(d) ? o.filter((x) => x !== d) : [...o, d]));

  async function create() {
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest<{ created: number; skipped: string[] }>('/api/course/sessions/bulk/', {
        method: 'POST',
        body: { semester_course: course, dates: chosen, teacher_name: teacher.trim() || undefined },
        token: accessToken,
      });
      setError('');
      alertDone(res.created, res.skipped.length);
    } catch (e) {
      setError(friendlyError(e, t('att_err_generic')));
    } finally {
      setBusy(false);
    }
  }

  function alertDone(created: number, skipped: number) {
    setDone(t('mng_plan_created', { n: created, s: skipped }));
    setTimeout(() => router.back(), 1200);
  }
  const [done, setDone] = useState('');

  return (
    <Screen title={t('mng_plan_title')} subtitle={title}>
      <AppText color={brand.muted}>{t('mng_plan_desc')}</AppText>

      <Card style={styles.card}>
        <AppText variant="label" color={brand.muted}>
          {t('mng_plan_weekdays')}
        </AppText>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <Pressable key={d} onPress={() => toggleWeekday(d)} style={[styles.day, weekdays.includes(d) && styles.dayActive]}>
              <AppText variant="caption" color={weekdays.includes(d) ? '#ffffff' : brand.primary}>
                {t(`cal_d${d}`)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <DateField label={t('mng_plan_from')} value={from} onChange={setFrom} />
        <DateField label={t('mng_plan_to')} value={to} onChange={setTo} />
        <View style={styles.extraRow}>
          <View style={styles.flex}>
            <DateField label={t('mng_plan_extra')} value={extra} onChange={setExtra} />
          </View>
          <Pressable
            style={styles.add}
            onPress={() => setExtras((list) => (list.includes(extra) ? list : [...list, extra]))}>
            <AppText variant="bodyStrong" color={brand.primary}>
              {t('mng_plan_add')}
            </AppText>
          </Pressable>
        </View>
        <View style={styles.field}>
          <AppText variant="label" color={brand.muted}>
            {t('mng_day_teacher')}
          </AppText>
          <TextInput value={teacher} onChangeText={setTeacher} style={styles.input} placeholderTextColor={brand.muted} />
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_plan_found', { n: dates.length })}</AppText>
        {dates.length === 0 ? <AppText color={brand.muted}>{t('mng_plan_none')}</AppText> : null}
        {dates.map((d) => (
          <Pressable key={d} onPress={() => toggleDate(d)} style={styles.dateRow}>
            <View style={[styles.box, !off.includes(d) && styles.boxOn]} />
            <AppText style={styles.flex}>{plainDate(d)}</AppText>
            {extras.includes(d) ? <Chip text={t('mng_plan_one_off')} tone="blue" /> : null}
          </Pressable>
        ))}
      </Card>

      {error ? (
        <Card style={[styles.card, { borderColor: brand.danger, borderWidth: 1.5 }]}>
          <AppText variant="bodyStrong" color={brand.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}
      {done ? (
        <Card style={[styles.card, { borderColor: brand.success, borderWidth: 1.5 }]}>
          <AppText variant="bodyStrong" color={brand.success}>
            {done}
          </AppText>
        </Card>
      ) : null}

      <Pressable style={[styles.button, (busy || chosen.length === 0 || !!done) && styles.disabled]} disabled={busy || chosen.length === 0 || !!done} onPress={create}>
        <AppText variant="bodyStrong" color="#ffffff">
          {t('mng_plan_create', { n: chosen.length })}
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: brand.primary },
  dayActive: { backgroundColor: brand.primary },
  extraRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  add: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: brand.primary },
  field: { gap: 6 },
  input: {
    fontFamily: font.regular,
    color: brand.text,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: brand.background,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: brand.border },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: brand.primary },
  boxOn: { backgroundColor: brand.primary },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, paddingVertical: 14, borderRadius: 14 },
  disabled: { opacity: 0.45 },
});
