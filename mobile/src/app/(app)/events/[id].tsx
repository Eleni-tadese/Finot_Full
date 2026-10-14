import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { attendanceChip, Chip, eventStatusChip } from '@/components/event-card';
import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { useApi } from '@/hooks/use-api';
import { etDateTime } from '@/lib/ethiopia-time';
import type { EventAttendance, Paginated, ServiceEvent } from '@/lib/types';

export default function EventDetailScreen() {
  // The file is named [id].tsx, so the address /events/12 gives us id = "12".
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: event, error, loading, refreshing, reload, retry } = useApi<ServiceEvent>(
    `/api/service/events/${id}/`,
  );
  const attendance = useApi<Paginated<EventAttendance>>('/api/service/attendance/');

  if (loading && !event) {
    return (
      <Screen>
        <LoadingView label="Loading event..." />
      </Screen>
    );
  }
  if (error && !event) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  }
  if (!event) {
    return null;
  }

  const status = eventStatusChip(event.status);
  const mine = attendance.data?.results.find((record) => record.event === event.id);
  const attended = attendanceChip(mine?.status);

  return (
    <Screen
      onRefresh={() => {
        reload();
        attendance.reload();
      }}
      refreshing={refreshing}>
      <View style={styles.chips}>
        <Chip text={status.text} tone={status.tone} />
        {attended && <Chip text={attended.text} tone={attended.tone} />}
        {event.service_group_name && <Chip text={event.service_group_name} tone="grey" />}
      </View>

      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Starts</Text>
        <Text style={styles.value}>{etDateTime(event.start_date)}</Text>
        <Text style={styles.label}>Ends</Text>
        <Text style={styles.value}>{etDateTime(event.end_date)}</Text>
        {event.place_name ? (
          <>
            <Text style={styles.label}>Place</Text>
            <Text style={styles.value}>{event.place_name}</Text>
          </>
        ) : null}
        {mine?.remark ? (
          <>
            <Text style={styles.label}>Remark</Text>
            <Text style={styles.value}>{mine.remark}</Text>
          </>
        ) : null}
      </View>

      {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

      {event.place_url ? (
        // Linking.openURL hands the address to the phone: a Google Maps link opens the Maps app.
        <Pressable style={styles.button} onPress={() => Linking.openURL(event.place_url as string)}>
          <Text style={styles.buttonText}>Open the map</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 26, fontWeight: '700', color: '#0f172a' },
  card: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, color: '#0f172a' },
  description: { fontSize: 16, color: '#334155', lineHeight: 24 },
  button: { backgroundColor: '#1e3a8a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
