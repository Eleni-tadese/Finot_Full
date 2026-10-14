import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateBadge, eventStatusChip } from '@/components/event-card';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { etDate, etTime } from '@/lib/ethiopia-time';
import { useSession } from '@/lib/session';
import type { Paginated, ServiceEvent, UnreadCount } from '@/lib/types';
import { useTranslation } from 'react-i18next';

type TileProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  badge?: number; // a red number on the corner, for example unread notifications
  onPress: () => void;
};

// One square button of the quick-actions grid.
function Tile({ icon, label, badge = 0, onPress }: TileProps) {
  return (
    <Card onPress={onPress} style={styles.tile}>
      <View>
        <IconBadge name={icon} size={48} />
        {badge > 0 && (
          <View style={styles.tileBadge}>
            <AppText variant="caption" color="#ffffff" style={styles.tileBadgeText}>
              {badge > 99 ? '99+' : badge}
            </AppText>
          </View>
        )}
      </View>
      <AppText variant="bodyStrong">{label}</AppText>
    </Card>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const router = useRouter();
  const unread = useApi<UnreadCount>('/api/notifications/unread-count/');
  const events = useApi<Paginated<ServiceEvent>>('/api/service/events/');

  // Tabs stay alive in the background, so useEffect would not run again when you come back to Home.
  // useFocusEffect runs EVERY time this screen becomes the visible one.
  // useCallback gives the effect the SAME function each time; without it the screen would reload in a loop.
  const { reload: reloadUnread } = unread;
  const { reload: reloadEvents } = events;
  useFocusEffect(
    useCallback(() => {
      reloadUnread();
      reloadEvents();
    }, [reloadUnread, reloadEvents]),
  );

  // The soonest event that has not finished yet. The server sends newest first, so we sort by start time.
  const nextEvent = useMemo(() => {
    const open = (events.data?.results ?? []).filter((e) => e.status !== 'COMPLETED');
    open.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    return open[0] ?? null;
  }, [events.data]);

  // The router only shows this screen to signed-in people, but TypeScript does not know that.
  if (!user) {
    return null;
  }

  const name = user.first_name || user.email;
  const roles = user.roles.length > 0 ? user.roles : [t('m_roles_student')];
  const count = unread.data?.count ?? 0;
  const refreshing = unread.refreshing || events.refreshing;

  function refreshAll() {
    reloadUnread();
    reloadEvents();
  }

  return (
    <Screen onRefresh={refreshAll} refreshing={refreshing}>
      {/* Hero */}
      <View style={styles.hero}>
        <Image source={require('@/assets/images/finot-logo.png')} style={styles.heroLogo} contentFit="contain" />
        <View style={styles.heroText}>
          <AppText variant="caption" color={brand.accent}>
            {t('m_gibi_gubae')}
          </AppText>
          <AppText variant="title" color="#ffffff" numberOfLines={1}>
            {t('m_hello', { name })}
          </AppText>
          <AppText variant="caption" color="#c7d2ee" numberOfLines={1}>
            {roles.join(' · ')}
          </AppText>
        </View>
      </View>

      {/* Next event */}
      <AppText variant="heading" style={styles.section}>
        {t('m_next_event')}
      </AppText>
      {events.loading && !events.data ? (
        <Card>
          <AppText color={brand.muted}>{t('loading')}</AppText>
        </Card>
      ) : nextEvent ? (
        <Card
          style={styles.nextEvent}
          onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(nextEvent.id) } })}>
          <DateBadge iso={nextEvent.start_date} />
          <View style={styles.nextBody}>
            <AppText variant="heading" numberOfLines={2}>
              {nextEvent.title}
            </AppText>
            <AppText variant="caption" color={brand.muted}>
              {etDate(nextEvent.start_date)} · {etTime(nextEvent.start_date)}
            </AppText>
            <Chip text={eventStatusChip(nextEvent.status, t).text} tone={eventStatusChip(nextEvent.status, t).tone} />
          </View>
        </Card>
      ) : (
        <Card>
          <AppText color={brand.muted}>{t('m_no_upcoming')}</AppText>
        </Card>
      )}

      {/* Quick actions */}
      <AppText variant="heading" style={styles.section}>
        {t('quick_actions')}
      </AppText>
      <View style={styles.grid}>
        <Tile icon="event" label={t('tab_events')} onPress={() => router.push('/events')} />
        <Tile icon="school" label={t('my_courses')} onPress={() => router.push('/courses')} />
        <Tile icon="how-to-reg" label={t('my_attendance')} onPress={() => router.push('/events/attendance')} />
        <Tile icon="notifications" label={t('notifications')} badge={count} onPress={() => router.push('/notifications')} />
        <Tile icon="volunteer-activism" label={t('donate')} onPress={() => router.push('/donate')} />
        <Tile icon="person" label={t('my_profile')} onPress={() => router.push('/profile')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: brand.primary,
    borderRadius: 20,
    padding: 18,
    borderBottomWidth: 4,
    borderBottomColor: brand.accent, // the amber accent line, like the website
  },
  heroLogo: { width: 60, height: 60, borderRadius: 14, backgroundColor: '#ffffff' },
  heroText: { flex: 1, gap: 1 },
  section: { marginTop: 8 },
  nextEvent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nextBody: { flex: 1, gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.8%', alignItems: 'flex-start', gap: 12 },
  tileBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: { fontWeight: '700', lineHeight: 16 },
});
