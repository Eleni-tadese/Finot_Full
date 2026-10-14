import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_URL, apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { HealthResponse } from '@/lib/types';

// The three states every screen that loads data must handle: loading, failed, done.
type ServerCheck =
  | { state: 'loading' }
  | { state: 'ok'; seconds: number }
  | { state: 'error'; message: string };

export default function HomeScreen() {
  const { signOut } = useSession();
  const [check, setCheck] = useState<ServerCheck>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0); // change it to ask again

  // useEffect runs after the screen appears, and again whenever `attempt` changes.
  useEffect(() => {
    let cancelled = false; // do not touch the screen if it was closed meanwhile
    const started = Date.now();
    setCheck({ state: 'loading' });

    apiRequest<HealthResponse>('/health/')
      .then(() => {
        if (!cancelled) setCheck({ state: 'ok', seconds: (Date.now() - started) / 1000 });
      })
      .catch((error: Error) => {
        if (!cancelled) setCheck({ state: 'error', message: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Finot</Text>
        <Text style={styles.subtitle}>Gibi Gubae fellowship</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Server check (temporary)</Text>
          <Text style={styles.cardText}>{API_URL}</Text>
          {check.state === 'loading' && <Text style={styles.cardText}>Asking the server... (it may be asleep)</Text>}
          {check.state === 'ok' && (
            <Text style={styles.ok}>Connected in {check.seconds.toFixed(1)} seconds</Text>
          )}
          {check.state === 'error' && <Text style={styles.error}>{check.message}</Text>}
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => setAttempt(attempt + 1)}>
          <Text style={styles.buttonText}>Check again</Text>
        </Pressable>

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
    gap: 6,
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardText: {
    fontSize: 14,
    color: '#475569',
  },
  ok: {
    fontSize: 16,
    fontWeight: '600',
    color: '#166534',
  },
  error: {
    fontSize: 14,
    color: '#b91c1c',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#1e3a8a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    marginTop: 12,
    fontSize: 16,
    color: '#1e3a8a',
  },
});
