import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { usePaginated } from '@/hooks/use-paginated';
import { apiRequest, friendlyError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { etToday, plainDate } from '@/lib/ethiopia-time';
import type { ClassDay, CoordinatedCourse } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Step R3: the class days of one course, newest first. Today is the only day that can go live (scan, room code);
// a past day is corrected by hand; a future day is closed (the server refuses to mark it).
export default function ManageDays() {
  const { t } = useTranslation();
  const router = useRouter();
  const { course, title } = useLocalSearchParams<{ course: string; title?: string }>();
  const { accessToken } = useSession();
  const days = usePaginated<ClassDay>(`/api/course/sessions/?semester_course=${course}`);
  const detail = useApi<CoordinatedCourse>(`/api/course/semester-courses/${course}/`);
  const today = etToday();
  const status = detail.data?.status;
  const completed = status === 'COMPLETED';
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Start, complete or reopen the course (the same three buttons as the website).
  const next = status === 'PLANNED' ? 'OPEN' : status === 'OPEN' ? 'COMPLETED' : 'OPEN';
  const nextLabel = status === 'PLANNED' ? 'mng_course_start' : status === 'OPEN' ? 'mng_course_complete' : 'mng_course_reopen';
  const nextAsk = status === 'PLANNED' ? 'mng_course_start_q' : status === 'OPEN' ? 'mng_course_complete_q' : 'mng_course_reopen_q';
  function changeStatus() {
    Alert.alert(t(nextLabel), t(nextAsk), [
      { text: t('mng_cancel'), style: 'cancel' },
      {
        text: t(nextLabel),
        onPress: async () => {
          setBusy(true);
          setNote('');
          try {
            await apiRequest(`/api/course/semester-courses/${course}/set-status/`, { method: 'POST', body: { status: next }, token: accessToken });
            detail.reload();
          } catch (e) {
            setNote(friendlyError(e, t('att_err_generic')));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  // Coming back from the add / edit / plan screens: load the days again.
  const { reload: reloadDays } = days;
  useFocusEffect(
    useCallback(() => {
      reloadDays();
    }, [reloadDays]),
  );
  const sorted = useMemo(() => [...days.items].sort((a, b) => b.date.localeCompare(a.date)), [days.items]);

  if (days.loading && days.items.length === 0) return <LoadingView />;
  if (days.error && days.items.length === 0) return <ErrorView message={days.error.message} onRetry={days.retry} />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={sorted}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshing={days.refreshing}
        onRefresh={days.reload}
        onEndReached={days.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.headerBox}>
            <AppText variant="title" color={brand.primary}>
              {title}
            </AppText>
            {status ? (
              <View style={styles.chips}>
                <Chip text={status === 'OPEN' ? t('m_in_progress') : status === 'COMPLETED' ? t('event_completed') : t('crs_status_planned')} tone={status === 'OPEN' ? 'green' : status === 'COMPLETED' ? 'grey' : 'blue'} />
              </View>
            ) : null}
            {note ? (
              <AppText variant="caption" color={brand.danger}>
                {note}
              </AppText>
            ) : null}
            {status ? (
              <Pressable style={[styles.outline, busy && styles.disabled]} disabled={busy} onPress={changeStatus}>
                <AppText variant="bodyStrong" color={brand.primary}>
                  {t(nextLabel)}
                </AppText>
              </Pressable>
            ) : null}
            {!completed ? (
              <View style={styles.row}>
                <Pressable
                  style={[styles.button, styles.flex]}
                  onPress={() => router.push({ pathname: '/manage/day-form', params: { course, title: title ?? '' } } as never)}>
                  <AppText variant="bodyStrong" color="#ffffff">
                    {t('mng_add_day')}
                  </AppText>
                </Pressable>
                <Pressable
                  style={[styles.outline, styles.flex]}
                  onPress={() => router.push({ pathname: '/manage/plan', params: { course, title: title ?? '' } } as never)}>
                  <AppText variant="bodyStrong" color={brand.primary}>
                    {t('mng_plan_days')}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyView icon="event-busy" message={t('mng_no_days')} />}
        renderItem={({ item }) => {
          const isToday = item.date === today;
          const future = item.date > today;
          return (
            <Card
              style={[styles.card, future && styles.future]}
              onPress={
                future
                  ? undefined
                  : () =>
                      router.push({
                        pathname: '/manage/room',
                        params: { session: item.id, title: title ?? '', date: item.date, course },
                      } as never)
              }>
              <View style={styles.text}>
                <AppText variant="heading">{plainDate(item.date)}</AppText>
                {item.topic ? (
                  <AppText variant="caption" color={brand.muted} numberOfLines={1}>
                    {item.topic}
                  </AppText>
                ) : null}
                <View style={styles.chips}>
                  {isToday ? <Chip text={t('mng_today')} tone="green" /> : null}
                  {future ? <Chip text={t('mng_day_future')} tone="grey" /> : null}
                  {!future && !isToday ? <Chip text={t('mng_day_past')} tone="blue" /> : null}
                  {item.marked_count > 0 ? <Chip text={t('mng_day_marked', { n: item.marked_count })} tone="grey" /> : null}
                </View>
              </View>
              {!completed ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => router.push({ pathname: '/manage/day-form', params: { course, session: item.id, title: title ?? '' } } as never)}>
                  <MaterialIcons name="edit" size={22} color={brand.primary} />
                </Pressable>
              ) : null}
              {future ? null : <MaterialIcons name="chevron-right" size={22} color={brand.muted} />}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.background },
  list: { padding: 20, gap: 12, flexGrow: 1 },
  headerBox: { gap: 10, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, paddingVertical: 12, borderRadius: 12 },
  outline: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: brand.primary, paddingVertical: 12, borderRadius: 12 },
  disabled: { opacity: 0.45 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  future: { opacity: 0.5 },
  text: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
