import { Pressable, StyleSheet, Text, View } from 'react-native';

import { etDateTime } from '@/lib/ethiopia-time';
import type { ServiceEvent } from '@/lib/types';

// A small coloured label. `tone` picks the colours; the text is what the person reads.
export function Chip({ text, tone }: { text: string; tone: 'blue' | 'green' | 'red' | 'grey' }) {
  return (
    <View style={[styles.chip, chipTones[tone].box]}>
      <Text style={[styles.chipText, chipTones[tone].text]}>{text}</Text>
    </View>
  );
}

const chipTones = {
  blue: { box: { backgroundColor: '#dbeafe' }, text: { color: '#1e3a8a' } },
  green: { box: { backgroundColor: '#dcfce7' }, text: { color: '#166534' } },
  red: { box: { backgroundColor: '#fee2e2' }, text: { color: '#b91c1c' } },
  grey: { box: { backgroundColor: '#e2e8f0' }, text: { color: '#334155' } },
} as const;

// Words and colours for the three event states the server can send.
export function eventStatusChip(status: string): { text: string; tone: 'blue' | 'green' | 'grey' } {
  if (status === 'ONGOING') return { text: 'Happening now', tone: 'green' };
  if (status === 'UPCOMING') return { text: 'Upcoming', tone: 'blue' };
  return { text: 'Finished', tone: 'grey' };
}

// My attendance for an event: undefined = nothing recorded.
export function attendanceChip(status: string | undefined): { text: string; tone: 'green' | 'red' } | null {
  if (status === 'PRESENT') return { text: 'You were present', tone: 'green' };
  if (status === 'ABSENT') return { text: 'You were absent', tone: 'red' };
  return null;
}

type EventCardProps = {
  event: ServiceEvent;
  attendanceStatus?: string;
  onPress: () => void;
};

export function EventCard({ event, attendanceStatus, onPress }: EventCardProps) {
  const status = eventStatusChip(event.status);
  const attended = attendanceChip(attendanceStatus);

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.chips}>
        <Chip text={status.text} tone={status.tone} />
        {attended && <Chip text={attended.text} tone={attended.tone} />}
        {event.service_group_name && <Chip text={event.service_group_name} tone="grey" />}
      </View>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.line}>{etDateTime(event.start_date)}</Text>
      {event.place_name ? <Text style={styles.line}>{event.place_name}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, gap: 6 },
  pressed: { opacity: 0.7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  line: { fontSize: 14, color: '#475569' },
});
