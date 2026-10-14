import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { attendanceChip, Chip } from '@/components/event-card';
import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { usePaginated } from '@/hooks/use-paginated';
import { etDateTime } from '@/lib/ethiopia-time';
import type { EventAttendance } from '@/lib/types';

// A small box with a big number, used for the summary at the top.
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function MyAttendanceScreen() {
  const { items, error, loading, refreshing, loadingMore, hasMore, loadMore, reload, retry } =
    usePaginated<EventAttendance>('/api/service/attendance/');

  // The summary must count EVERY record, so keep asking for pages until there are no more.
  useEffect(() => {
    if (hasMore && !loading && !loadingMore) {
      loadMore();
    }
  });

  if (loading && items.length === 0) {
    return (
      <Screen>
        <LoadingView label="Loading your attendance..." />
      </Screen>
    );
  }
  if (error && items.length === 0) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  }

  const present = items.filter((record) => record.status === 'PRESENT').length;
  const absent = items.filter((record) => record.status === 'ABSENT').length;
  const total = present + absent;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <View style={styles.summary}>
        <Stat label="Present" value={String(present)} color="#166534" />
        <Stat label="Absent" value={String(absent)} color="#b91c1c" />
        <Stat label="Attendance" value={total > 0 ? `${rate}%` : '-'} color="#1e3a8a" />
      </View>

      {items.length === 0 ? (
        <EmptyView message="No attendance has been recorded for you yet." />
      ) : (
        items.map((record) => {
          const chip = attendanceChip(record.status);
          return (
            <View key={record.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{record.event_title}</Text>
                {chip && <Chip text={record.status === 'PRESENT' ? 'Present' : 'Absent'} tone={chip.tone} />}
              </View>
              <Text style={styles.rowDate}>{etDateTime(record.event_date)}</Text>
              {record.remark ? <Text style={styles.remark}>{record.remark}</Text> : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 26, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#64748b', textTransform: 'uppercase' },
  row: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0f172a' },
  rowDate: { fontSize: 14, color: '#475569' },
  remark: { fontSize: 14, color: '#334155', fontStyle: 'italic' },
});
