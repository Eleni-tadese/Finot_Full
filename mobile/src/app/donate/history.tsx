import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import { etDateTime } from '@/lib/ethiopia-time';
import type { DonationHistoryItem } from '@/lib/types';

function statusChip(status: string): { text: string; tone: 'green' | 'amber' | 'red' } {
  if (status === 'COMPLETED') return { text: 'Completed', tone: 'green' };
  if (status === 'FAILED') return { text: 'Failed', tone: 'red' };
  return { text: 'Pending', tone: 'amber' };
}

export default function DonationHistoryScreen() {
  const { items, error, loading, refreshing, loadingMore, loadMore, reload, retry } =
    usePaginated<DonationHistoryItem>('/api/donations/my-history/');

  if (loading && items.length === 0) {
    return <LoadingView label="Loading your donations..." />;
  }
  if (error && items.length === 0) {
    return <ErrorView message={error.message} onRetry={retry} />;
  }

  // Only completed payments count towards the total.
  const total = items
    .filter((item) => item.payment.status === 'COMPLETED')
    .reduce((sum, item) => sum + Number(item.payment.amount), 0);

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={reload} colors={[brand.primary]} tintColor={brand.primary} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <Card style={styles.total}>
          <AppText variant="label" color={brand.muted}>
            Total given
          </AppText>
          <AppText variant="display" color={brand.primary}>
            {total.toFixed(2)} ETB
          </AppText>
          <AppText variant="caption" color={brand.muted}>
            Completed donations only
          </AppText>
        </Card>
      }
      renderItem={({ item }) => {
        const chip = statusChip(item.payment.status);
        return (
          <Card style={styles.row}>
            <MaterialIcons name="volunteer-activism" size={26} color={brand.primary} />
            <View style={styles.rowText}>
              <AppText variant="heading">
                {item.payment.amount} {item.payment.currency}
              </AppText>
              <AppText variant="caption" color={brand.muted}>
                {etDateTime(item.donated_at)}
              </AppText>
              <AppText variant="caption" color={brand.muted}>
                {item.fund_category}
              </AppText>
            </View>
            <Chip text={chip.text} tone={chip.tone} />
          </Card>
        );
      }}
      ListEmptyComponent={<EmptyView icon="volunteer-activism" message="You have not made a donation yet." />}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={brand.primary} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, flexGrow: 1 },
  gap: { height: 10 },
  footer: { marginVertical: 16 },
  total: { gap: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 1 },
});
