import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useSession } from '@/lib/session';

export default function HomeScreen() {
  const { user } = useSession();

  // The router only shows this screen to signed-in people, but TypeScript does not know that.
  if (!user) {
    return null;
  }

  const name = user.first_name || user.email;
  // A plain student has no role row, so the list can be empty.
  const roles = user.roles.length > 0 ? user.roles : ['Student'];

  return (
    <Screen>
      <Text style={styles.hello}>Hello, {name}</Text>
      <Text style={styles.subtitle}>Gibi Gubae fellowship</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Your roles</Text>
        <View style={styles.chips}>
          {roles.map((role) => (
            <View key={role} style={styles.chip}>
              <Text style={styles.chipText}>{role}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Coming next</Text>
        <Text style={styles.cardText}>Events and attendance, notifications, my courses and donations.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontSize: 28, fontWeight: '700', color: '#1e3a8a' },
  subtitle: { fontSize: 16, color: '#475569', marginBottom: 8 },
  card: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, gap: 8 },
  cardLabel: { fontSize: 12, color: '#64748b', textTransform: 'uppercase' },
  cardText: { fontSize: 15, color: '#334155' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#dbeafe', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  chipText: { color: '#1e3a8a', fontWeight: '600', fontSize: 14 },
});
