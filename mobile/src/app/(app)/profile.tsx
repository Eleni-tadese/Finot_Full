import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/lib/session';
import type { StudentProfile } from '@/lib/types';

// One row of the details card: a small label and its value ("-" when the student left it empty).
function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value === null || value === undefined || value === '' ? '-' : value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { signOut } = useSession();
  const { data: profile, error, loading, refreshing, reload, retry } =
    useApi<StudentProfile>('/api/student/profiles/me/');

  // The three states, in order: loading, error, then the real screen.
  if (loading && !profile) {
    return (
      <Screen>
        <LoadingView label="Loading your profile... (the server may be waking up)" />
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen>
        <ErrorView message={friendlyMessage(error.status, error.body, error.message)} onRetry={retry} />
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!profile) {
    return null;
  }

  const fullName = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ');
  const dorm =
    profile.dorm_block !== null && profile.dorm_room !== null
      ? `Block ${profile.dorm_block}, room ${profile.dorm_room}`
      : null;

  return (
    // Pull down on this screen to load the profile again.
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Text style={styles.name}>{fullName || profile.user_email}</Text>
      <Text style={styles.email}>{profile.user_email}</Text>

      <View style={styles.card}>
        <Row label="Year of study" value={profile.batch_year ? `Year ${profile.batch_year}` : null} />
        <Row label="Department" value={profile.department} />
        <Row label="Status" value={profile.status === 'GRADUATED' ? 'Graduate' : 'In campus'} />
        <Row label="Phone" value={profile.personal_phone} />
        <Row label="Telegram" value={profile.telegram_username} />
        <Row label="Dorm" value={dorm} />
        <Row label="Home address" value={profile.home_address} />
      </View>

      <Pressable onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

// The server sends a technical `code` for a student who has not finished the account set-up.
function friendlyMessage(status: number, body: unknown, fallback: string): string {
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  if (code === 'account_setup_required') {
    return 'Finish your account set-up on the Finot website first (write your name, confirm your email, choose a password).';
  }
  if (status === 404) {
    return 'Your profile does not exist yet. Open the Finot website once to create it.';
  }
  return fallback;
}

const styles = StyleSheet.create({
  name: { fontSize: 26, fontWeight: '700', color: '#0f172a' },
  email: { fontSize: 15, color: '#475569', marginBottom: 8 },
  card: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, gap: 14 },
  row: { gap: 2 },
  label: { fontSize: 12, color: '#64748b', textTransform: 'uppercase' },
  value: { fontSize: 16, color: '#0f172a' },
  signOut: { marginTop: 16, fontSize: 16, color: '#1e3a8a', textAlign: 'center' },
});
