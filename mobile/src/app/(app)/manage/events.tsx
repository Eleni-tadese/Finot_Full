import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event-card';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import type { ServiceEvent } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Step R2: the events THIS person may take attendance for. The server says which ones with `can_take_attendance`
// (the same rule the website uses), so the phone only filters the list.
export default function ManageEvents() {
  const { t } = useTranslation();
  const router = useRouter();
  const events = usePaginated<ServiceEvent>('/api/service/events/');

  // Happening now first, then the coming ones soonest first. Finished events are left out.
  const mine = useMemo(() => {
    const open = events.items.filter((e) => e.can_take_attendance && e.status !== 'COMPLETED');
    const rank = (e: ServiceEvent) => (e.status === 'ONGOING' ? 0 : 1);
    return [...open].sort((a, b) => rank(a) - rank(b) || a.start_date.localeCompare(b.start_date));
  }, [events.items]);

  if (events.loading && events.items.length === 0) return <LoadingView />;
  if (events.error && events.items.length === 0) return <ErrorView message={events.error.message} onRetry={events.retry} />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={mine}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        refreshing={events.refreshing}
        onRefresh={events.reload}
        onEndReached={events.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<EmptyView icon="event-busy" message={t('mng_no_events')} />}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => router.push({ pathname: '/manage/room', params: { event: String(item.id) } } as never)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.background },
  list: { padding: 20, gap: 12, flexGrow: 1 },
});
