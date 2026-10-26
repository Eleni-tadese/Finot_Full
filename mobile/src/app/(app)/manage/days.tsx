import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import { etToday, plainDate } from '@/lib/ethiopia-time';
import type { ClassDay } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Step R3: the class days of one course, newest first. Today is the only day that can go live (scan, room code);
// a past day is corrected by hand; a future day is closed (the server refuses to mark it).
export default function ManageDays() {
  const { t } = useTranslation();
  const router = useRouter();
  const { course, title } = useLocalSearchParams<{ course: string; title?: string }>();
  const days = usePaginated<ClassDay>(`/api/course/sessions/?semester_course=${course}`);
  const today = etToday();

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
          <AppText variant="title" color={brand.primary} style={styles.header}>
            {title}
          </AppText>
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
  header: { marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  future: { opacity: 0.5 },
  text: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
