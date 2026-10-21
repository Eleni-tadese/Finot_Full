import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand } from '@/constants/brand';
import { etDay, etMonthShort, etTime } from '@/lib/ethiopia-time';
import type { ServiceEvent } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Words and colours for the three event states the server can send.
export function eventStatusChip(status: string, t: TFunction): { text: string; tone: 'blue' | 'green' | 'grey' } {
  if (status === 'ONGOING') return { text: t('m_status_ongoing'), tone: 'green' };
  if (status === 'UPCOMING') return { text: t('event_upcoming'), tone: 'blue' };
  return { text: t('event_completed'), tone: 'grey' };
}

// My attendance for an event: undefined = nothing recorded.
export function attendanceChip(status: string | undefined, t: TFunction): { text: string; tone: 'green' | 'red' } | null {
  if (status === 'PRESENT') return { text: t('m_you_present'), tone: 'green' };
  if (status === 'ABSENT') return { text: t('m_you_absent'), tone: 'red' };
  return null;
}

// The little calendar tile: big day number over the month.
export function DateBadge({ iso, muted = false }: { iso: string; muted?: boolean }) {
  return (
    <View style={[styles.badge, muted && styles.badgeMuted]}>
      <AppText variant="title" color={muted ? brand.muted : brand.primary} style={styles.badgeDay}>
        {etDay(iso)}
      </AppText>
      <AppText variant="label" color={muted ? brand.muted : brand.primary}>
        {etMonthShort(iso)}
      </AppText>
    </View>
  );
}

type EventCardProps = {
  event: ServiceEvent;
  attendanceStatus?: string;
  onPress: () => void;
  onCheckIn?: () => void; // given only while the event is happening now
};

export function EventCard({ event, attendanceStatus, onPress, onCheckIn }: EventCardProps) {
  const { t } = useTranslation();
  const status = eventStatusChip(event.status, t);
  const attended = attendanceChip(attendanceStatus, t);
  const finished = event.status === 'COMPLETED';

  return (
    <Card onPress={onPress} style={styles.card}>
      <DateBadge iso={event.start_date} muted={finished} />

      <View style={styles.body}>
        <AppText variant="heading" numberOfLines={2}>
          {event.title}
        </AppText>

        <View style={styles.meta}>
          <MaterialIcons name="schedule" size={15} color={brand.muted} />
          <AppText variant="caption" color={brand.muted}>
            {etTime(event.start_date)} - {etTime(event.end_date)}
          </AppText>
        </View>

        {event.place_name ? (
          <View style={styles.meta}>
            <MaterialIcons name="place" size={15} color={brand.muted} />
            <AppText variant="caption" color={brand.muted} numberOfLines={1} style={styles.metaText}>
              {event.place_name}
            </AppText>
          </View>
        ) : null}

        <View style={styles.chips}>
          <Chip text={status.text} tone={status.tone} />
          {attended && <Chip text={attended.text} tone={attended.tone} />}
          {event.service_group_name ? <Chip text={event.service_group_name} tone="amber" /> : null}
        </View>

        {onCheckIn ? (
          <Pressable style={styles.checkIn} onPress={onCheckIn}>
            <MaterialIcons name="qr-code-scanner" size={16} color="#ffffff" />
            <AppText variant="caption" color="#ffffff" style={styles.checkInText}>
              {t('checkin_title')}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <MaterialIcons name="chevron-right" size={22} color={brand.muted} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  body: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: {
    width: 56,
    height: 62,
    borderRadius: 14,
    backgroundColor: brand.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeMuted: { backgroundColor: '#eef2f7' },
  checkIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: brand.primary,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  checkInText: { fontWeight: '600' },
  badgeDay: { lineHeight: 26 },
});
