import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import { apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';
import { timeAgo } from '@/lib/time-ago';
import type { AppNotification } from '@/lib/types';

// Each kind of notification gets its own icon, so the list can be scanned at a glance.
const ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  EVENT: 'event',
  DONATION: 'volunteer-activism',
  REMINDER: 'alarm',
  QA: 'question-answer',
  SYSTEM: 'info',
};

export default function NotificationsScreen() {
  const { accessToken } = useSession();
  const { items, setItems, error, loading, refreshing, loadingMore, loadMore, reload, retry } =
    usePaginated<AppNotification>('/api/notifications/');

  const unread = items.filter((item) => !item.is_read).length;

  // OPTIMISTIC update: change the screen first (it feels instant), then tell the server.
  // If the server refuses, put the row back as it was.
  async function markRead(notification: AppNotification) {
    if (notification.is_read) return;
    setItems((old) => old.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
    try {
      await apiRequest(`/api/notifications/${notification.id}/mark-read/`, {
        method: 'POST',
        token: accessToken,
      });
    } catch {
      setItems((old) => old.map((n) => (n.id === notification.id ? { ...n, is_read: false } : n)));
    }
  }

  async function markAllRead() {
    const before = items;
    setItems((old) => old.map((n) => ({ ...n, is_read: true })));
    try {
      await apiRequest('/api/notifications/mark-all-read/', { method: 'POST', token: accessToken });
    } catch {
      setItems(before);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <PageHeader
          title="Alerts"
          subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up'}
          right={
            unread > 0 ? (
              <Pressable onPress={markAllRead} style={styles.markAll}>
                <MaterialIcons name="done-all" size={18} color={brand.primary} />
                <AppText variant="bodyStrong" color={brand.primary}>
                  Read all
                </AppText>
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {loading && items.length === 0 ? (
        <LoadingView label="Loading notifications..." />
      ) : error && items.length === 0 ? (
        <ErrorView message={error.message} onRetry={retry} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Card style={[styles.card, !item.is_read && styles.cardUnread]} onPress={() => markRead(item)}>
              <IconBadge
                name={ICONS[item.notification_type] ?? 'notifications'}
                background={item.is_read ? '#eef2f7' : brand.primarySoft}
                color={item.is_read ? brand.muted : brand.primary}
              />
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <AppText variant={item.is_read ? 'bodyStrong' : 'heading'} style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </AppText>
                  {!item.is_read && <View style={styles.dot} />}
                </View>
                <AppText variant="body" color={brand.text} numberOfLines={4}>
                  {item.message}
                </AppText>
                <AppText variant="caption" color={brand.muted}>
                  {timeAgo(item.created_at)}
                </AppText>
              </View>
            </Card>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={reload} colors={[brand.primary]} tintColor={brand.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyView icon="notifications-none" message="You have no notifications." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={brand.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.background },
  top: { paddingHorizontal: 20, paddingTop: 20 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: brand.primarySoft,
  },
  list: { padding: 20, flexGrow: 1 },
  gap: { height: 10 },
  footer: { marginVertical: 16 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cardUnread: { borderColor: '#c7d2ee', backgroundColor: '#fbfcff' },
  cardBody: { flex: 1, gap: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: brand.primary, marginTop: 6 },
});
