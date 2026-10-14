import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event-card';
import { PageHeader } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import type { EventAttendance, ServiceEvent } from '@/lib/types';
import { useTranslation } from 'react-i18next';

type Filter = 'ALL' | 'UPCOMING' | 'PAST';

// `label` is a translation key
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'all' },
  { key: 'UPCOMING', label: 'event_upcoming' },
  { key: 'PAST', label: 'past' },
];

export default function EventsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const events = usePaginated<ServiceEvent>('/api/service/events/');
  const attendance = usePaginated<EventAttendance>('/api/service/attendance/');
  const [filter, setFilter] = useState<Filter>('ALL');

  // event id -> my status for it. useMemo = only rebuild it when the attendance list changes.
  const attendanceByEvent = useMemo(() => {
    const map = new Map<number, string>();
    attendance.items.forEach((record) => map.set(record.event, record.status));
    return map;
  }, [attendance.items]);

  // Filtering happens on the phone, on the events that are already loaded.
  const visible = useMemo(() => {
    if (filter === 'UPCOMING') return events.items.filter((e) => e.status !== 'COMPLETED');
    if (filter === 'PAST') return events.items.filter((e) => e.status === 'COMPLETED');
    return events.items;
  }, [events.items, filter]);

  function reloadAll() {
    events.reload();
    attendance.reload();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <PageHeader title={t('tab_events')} subtitle={t('m_events_subtitle')} />

        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const active = item.key === filter;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={[styles.filter, active && styles.filterActive]}>
                <AppText variant="bodyStrong" color={active ? '#ffffff' : brand.primary}>
                  {t(item.label)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {events.loading && events.items.length === 0 ? (
        <LoadingView />
      ) : events.error && events.items.length === 0 ? (
        <ErrorView message={events.error.message} onRetry={events.retry} />
      ) : (
        // FlatList draws only the rows that are on the screen, so a list of 1000 stays fast.
        <FlatList
          data={visible}
          keyExtractor={(event) => String(event.id)}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              attendanceStatus={attendanceByEvent.get(item.id)}
              onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(item.id) } })}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={events.refreshing}
              onRefresh={reloadAll}
              colors={[brand.primary]}
              tintColor={brand.primary}
            />
          }
          onEndReached={events.loadMore} // reached the bottom: ask for the next page
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyView
              icon="event-busy"
              message={filter === 'ALL' ? t('m_no_events') : t('m_no_events_list')}
            />
          }
          ListFooterComponent={
            events.loadingMore ? <ActivityIndicator style={styles.footer} color={brand.primary} /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.background },
  top: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: brand.card,
    borderWidth: 1,
    borderColor: brand.border,
  },
  filterActive: { backgroundColor: brand.primary, borderColor: brand.primary },
  list: { padding: 20, flexGrow: 1 },
  gap: { height: 12 },
  footer: { marginVertical: 16 },
});
