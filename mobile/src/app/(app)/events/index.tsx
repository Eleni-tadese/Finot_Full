import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event-card';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { usePaginated } from '@/hooks/use-paginated';
import type { EventAttendance, ServiceEvent } from '@/lib/types';

export default function EventsScreen() {
  const router = useRouter();
  const events = usePaginated<ServiceEvent>('/api/service/events/');
  const attendance = usePaginated<EventAttendance>('/api/service/attendance/');

  // event id -> my status for it. useMemo = only rebuild it when the attendance list changes.
  const attendanceByEvent = useMemo(() => {
    const map = new Map<number, string>();
    attendance.items.forEach((record) => map.set(record.event, record.status));
    return map;
  }, [attendance.items]);

  function reloadAll() {
    events.reload();
    attendance.reload();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Pressable onPress={() => router.push('/events/attendance')}>
          <Text style={styles.headerLink}>My attendance</Text>
        </Pressable>
      </View>

      {events.loading && events.items.length === 0 ? (
        <LoadingView label="Loading events..." />
      ) : events.error && events.items.length === 0 ? (
        <ErrorView message={events.error.message} onRetry={events.retry} />
      ) : (
        // FlatList draws only the rows that are on the screen, so a list of 1000 stays fast.
        <FlatList
          data={events.items}
          keyExtractor={(event) => String(event.id)}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              attendanceStatus={attendanceByEvent.get(item.id)}
              onPress={() =>
                router.push({ pathname: '/events/[id]', params: { id: String(item.id) } })
              }
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          refreshControl={<RefreshControl refreshing={events.refreshing} onRefresh={reloadAll} />}
          onEndReached={events.loadMore} // reached the bottom: ask for the next page
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyView message="No events yet." />}
          ListFooterComponent={events.loadingMore ? <ActivityIndicator style={styles.footer} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1e3a8a' },
  headerLink: { fontSize: 16, color: '#1e3a8a', fontWeight: '600' },
  list: { padding: 20, flexGrow: 1 },
  gap: { height: 12 },
  footer: { marginVertical: 16 },
});
