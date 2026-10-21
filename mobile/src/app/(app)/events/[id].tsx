import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { attendanceChip, eventStatusChip } from '@/components/event-card';
import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { etDate, etTime } from '@/lib/ethiopia-time';
import type { EventAttendance, Paginated, ServiceEvent } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// One line of the details card: an icon, a small label and the value.
function InfoRow({ icon, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <IconBadge name={icon} size={40} />
      <View style={styles.infoText}>
        <AppText variant="label" color={brand.muted}>
          {label}
        </AppText>
        <AppText variant="bodyStrong">{value}</AppText>
      </View>
    </View>
  );
}

export default function EventDetailScreen() {
  const { t } = useTranslation();
  // The file is named [id].tsx, so the address /events/12 gives us id = "12".
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: event, error, loading, refreshing, reload, retry } = useApi<ServiceEvent>(
    `/api/service/events/${id}/`,
  );
  const attendance = useApi<Paginated<EventAttendance>>('/api/service/attendance/');

  if (loading && !event) {
    return (
      <Screen>
        <LoadingView />
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

  const status = eventStatusChip(event.status, t);
  const mine = attendance.data?.results.find((record) => record.event === event.id);
  const attended = attendanceChip(mine?.status, t);

  return (
    <Screen
      onRefresh={() => {
        reload();
        attendance.reload();
      }}
      refreshing={refreshing}>
      <View style={styles.chips}>
        <Chip text={status.text} tone={status.tone} />
        {event.service_group_name ? <Chip text={event.service_group_name} tone="amber" /> : null}
      </View>

      <AppText variant="display" color={brand.primary}>
        {event.title}
      </AppText>

      {attended && (
        <Card style={[styles.attendance, { backgroundColor: attended.tone === 'green' ? brand.successSoft : brand.dangerSoft }]}>
          <MaterialIcons
            name={attended.tone === 'green' ? 'check-circle' : 'cancel'}
            size={24}
            color={attended.tone === 'green' ? brand.success : brand.danger}
          />
          <View style={styles.infoText}>
            <AppText variant="bodyStrong" color={attended.tone === 'green' ? brand.success : brand.danger}>
              {attended.text}
            </AppText>
            {mine?.remark ? (
              <AppText variant="caption" color={brand.text}>
                {mine.remark}
              </AppText>
            ) : null}
          </View>
        </Card>
      )}

      <Card style={styles.details}>
        <InfoRow icon="event" label={t('date')} value={etDate(event.start_date)} />
        <InfoRow
          icon="schedule"
          label={t('time')}
          value={`${etTime(event.start_date)} - ${etTime(event.end_date)}`}
        />
        {event.place_name ? <InfoRow icon="place" label={t('m_place')} value={event.place_name} /> : null}
        {event.created_by_name ? <InfoRow icon="person" label={t('m_posted_by')} value={event.created_by_name} /> : null}
      </Card>

      {event.description ? (
        <Card>
          <AppText variant="label" color={brand.muted} style={styles.descriptionLabel}>
            {t('m_about_event')}
          </AppText>
          <AppText>{event.description}</AppText>
        </Card>
      ) : null}

      {event.status === 'ONGOING' && mine?.status !== 'PRESENT' ? (
        <Pressable
          style={styles.button}
          onPress={() => router.push({ pathname: '/events/check-in', params: { event: String(event.id) } })}>
          <MaterialIcons name="qr-code-scanner" size={20} color="#ffffff" />
          <AppText variant="bodyStrong" color="#ffffff">
            {t('checkin_title')}
          </AppText>
        </Pressable>
      ) : null}

      {event.place_url ? (
        // Linking.openURL hands the address to the phone: a Google Maps link opens the Maps app.
        <Pressable style={styles.button} onPress={() => Linking.openURL(event.place_url as string)}>
          <MaterialIcons name="map" size={20} color="#ffffff" />
          <AppText variant="bodyStrong" color="#ffffff">
            {t('m_open_map')}
          </AppText>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attendance: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  details: { gap: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, gap: 1 },
  descriptionLabel: { marginBottom: 6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.primary,
    paddingVertical: 15,
    borderRadius: 14,
  },
});
