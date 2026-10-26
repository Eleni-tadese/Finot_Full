import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { brand, font } from '@/constants/brand';
import { apiRequest, friendlyError } from '@/lib/api';
import { etToday } from '@/lib/ethiopia-time';
import { useSession } from '@/lib/session';
import type { ClassDay } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// One class day of a course: add a new one, or edit / delete an existing one (?session=<id>).
export default function DayForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accessToken } = useSession();
  const { course, session, title } = useLocalSearchParams<{ course: string; session?: string; title?: string }>();
  const editing = !!session;

  const [date, setDate] = useState(etToday());
  const [topic, setTopic] = useState('');
  const [teacher, setTeacher] = useState('');
  const [marked, setMarked] = useState(0);
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    apiRequest<ClassDay>(`/api/course/sessions/${session}/`, { token: accessToken })
      .then((day) => {
        setDate(day.date);
        setTopic(day.topic ?? '');
        setTeacher(day.teacher_name ?? '');
        setMarked(day.marked_count ?? 0);
      })
      .catch((e) => setError(friendlyError(e, t('att_err_generic'))))
      .finally(() => setLoading(false));
  }, [session, accessToken, t]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const body = { semester_course: course, date, topic: topic.trim() || null, teacher_name: teacher.trim() || null };
      if (editing) {
        await apiRequest(`/api/course/sessions/${session}/`, { method: 'PATCH', body, token: accessToken });
      } else {
        await apiRequest('/api/course/sessions/', { method: 'POST', body, token: accessToken });
      }
      router.back();
    } catch (e) {
      setError(friendlyError(e, t('att_err_generic')));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('mng_day_delete'), marked > 0 ? t('mng_day_delete_marked_q', { n: marked }) : t('mng_day_delete_q'), [
      { text: t('mng_cancel'), style: 'cancel' },
      {
        text: t('mng_day_delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await apiRequest(`/api/course/sessions/${session}/`, { method: 'DELETE', token: accessToken });
            router.back();
          } catch (e) {
            setError(friendlyError(e, t('att_err_generic')));
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) return <LoadingView />;

  return (
    <Screen title={editing ? t('mng_edit_day') : t('mng_add_day')} subtitle={title}>
      <Card style={styles.card}>
        <DateField label={t('mng_day_date')} value={date} onChange={setDate} />
        <View style={styles.field}>
          <AppText variant="label" color={brand.muted}>
            {t('mng_day_topic')}
          </AppText>
          <TextInput value={topic} onChangeText={setTopic} style={styles.input} placeholderTextColor={brand.muted} />
        </View>
        <View style={styles.field}>
          <AppText variant="label" color={brand.muted}>
            {t('mng_day_teacher')}
          </AppText>
          <TextInput value={teacher} onChangeText={setTeacher} style={styles.input} placeholderTextColor={brand.muted} />
        </View>
      </Card>

      {error ? (
        <Card style={[styles.card, { borderColor: brand.danger, borderWidth: 1.5 }]}>
          <AppText variant="bodyStrong" color={brand.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={save}>
        <AppText variant="bodyStrong" color="#ffffff">
          {t('mng_day_save')}
        </AppText>
      </Pressable>
      {editing ? (
        <Pressable style={[styles.danger, busy && styles.disabled]} disabled={busy} onPress={confirmDelete}>
          <AppText variant="bodyStrong" color={brand.danger}>
            {t('mng_day_delete')}
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
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
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, paddingVertical: 14, borderRadius: 14 },
  danger: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: brand.danger, paddingVertical: 14, borderRadius: 14 },
  disabled: { opacity: 0.45 },
});
