import { MaterialIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import { etDate, etTime } from '@/lib/ethiopia-time';
import type { EventAttendance } from '@/lib/types';

// A small box with a big number, used for the summary at the top.
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={styles.stat}>
      <AppText variant="display" color={color}>
        {value}
      </AppText>
      <AppText variant="label" color={brand.muted}>
        {label}
      </AppText>
    </Card>
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
        <Stat label="Present" value={String(present)} color={brand.success} />
        <Stat label="Absent" value={String(absent)} color={brand.danger} />
        <Stat label="Rate" value={total > 0 ? `${rate}%` : '-'} color={brand.primary} />
      </View>

      {items.length === 0 ? (
        <EmptyView icon="how-to-reg" message="No attendance has been recorded for you yet." />
      ) : (
        items.map((record) => {
          const isPresent = record.status === 'PRESENT';
          return (
            <Card key={record.id} style={styles.row}>
              <MaterialIcons
                name={isPresent ? 'check-circle' : 'cancel'}
                size={28}
                color={isPresent ? brand.success : brand.danger}
              />
              <View style={styles.rowText}>
                <AppText variant="heading" numberOfLines={2}>
                  {record.event_title}
                </AppText>
                <AppText variant="caption" color={brand.muted}>
                  {etDate(record.event_date)} · {etTime(record.event_date)}
                </AppText>
                {record.remark ? (
                  <AppText variant="caption" color={brand.text} style={styles.remark}>
                    {record.remark}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="bodyStrong" color={isPresent ? brand.success : brand.danger}>
                {isPresent ? 'Present' : 'Absent'}
              </AppText>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 14, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  remark: { fontStyle: 'italic' },
});
