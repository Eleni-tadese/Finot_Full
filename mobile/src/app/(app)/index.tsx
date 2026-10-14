import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';

export default function HomeScreen() {
  const { user, signOut } = useSession();

  // The router only shows this screen to signed-in people, but TypeScript does not know that.
  if (!user) {
    return null;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  // A plain student has no role row, so the list can be empty.
  const roles = user.roles.length > 0 ? user.roles.join(', ') : 'Student';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Finot</Text>
        <Text style={styles.subtitle}>Gibi Gubae fellowship</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.name}>{fullName || user.email}</Text>
          <Text style={styles.cardText}>{user.email}</Text>
          <Text style={styles.cardLabel}>Roles</Text>
          <Text style={styles.cardText}>{roles}</Text>
        </View>

        <Pressable onPress={signOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  subtitle: {
    fontSize: 18,
    color: '#475569',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    marginTop: 16,
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardText: {
    fontSize: 15,
    color: '#334155',
  },
  link: {
    marginTop: 16,
    fontSize: 16,
    color: '#1e3a8a',
  },
});
