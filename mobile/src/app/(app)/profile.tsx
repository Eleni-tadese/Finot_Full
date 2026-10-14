import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/lib/session';
import type { StudentProfile } from '@/lib/types';

type Icon = keyof typeof MaterialIcons.glyphMap;

// One row of a details card: an icon, a small label and the value ("Not set" when the student left it empty).
function Row({ icon, label, value }: { icon: Icon; label: string; value: string | number | null | undefined }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <View style={styles.row}>
      <IconBadge name={icon} size={40} />
      <View style={styles.rowText}>
        <AppText variant="label" color={brand.muted}>
          {label}
        </AppText>
        <AppText variant="bodyStrong" color={empty ? brand.muted : brand.text}>
          {empty ? 'Not set' : value}
        </AppText>
      </View>
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
      <Screen title="Profile">
        <LoadingView label="Loading your profile... (the server may be waking up)" />
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen title="Profile">
        <ErrorView message={friendlyMessage(error.status, error.body, error.message)} onRetry={retry} />
        <SignOutButton onPress={signOut} />
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
    <Screen title="Profile" onRefresh={reload} refreshing={refreshing}>
      <Card style={styles.identity}>
        <Avatar name={fullName || profile.user_email} photo={profile.profile_image} size={84} />
        <AppText variant="title" style={styles.centerText}>
          {fullName || profile.user_email}
        </AppText>
        <AppText variant="caption" color={brand.muted}>
          {profile.user_email}
        </AppText>
        <Chip
          text={profile.status === 'GRADUATED' ? 'Graduate' : 'In campus'}
          tone={profile.status === 'GRADUATED' ? 'amber' : 'green'}
        />
      </Card>

      <AppText variant="heading" style={styles.section}>
        Study
      </AppText>
      <Card style={styles.group}>
        <Row icon="school" label="Year of study" value={profile.batch_year ? `Year ${profile.batch_year}` : null} />
        <Row icon="account-balance" label="Department" value={profile.department} />
      </Card>

      <AppText variant="heading" style={styles.section}>
        Contact
      </AppText>
      <Card style={styles.group}>
        <Row icon="phone" label="Phone" value={profile.personal_phone} />
        <Row icon="send" label="Telegram" value={profile.telegram_username} />
        <Row icon="apartment" label="Dorm" value={dorm} />
        <Row icon="home" label="Home address" value={profile.home_address} />
      </Card>

      <SignOutButton onPress={signOut} />
    </Screen>
  );
}

function SignOutButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.signOut, pressed && styles.pressed]} onPress={onPress}>
      <MaterialIcons name="logout" size={20} color={brand.danger} />
      <AppText variant="bodyStrong" color={brand.danger}>
        Sign out
      </AppText>
    </Pressable>
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
  identity: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  centerText: { textAlign: 'center', marginTop: 6 },
  section: { marginTop: 8 },
  group: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 1 },
  signOut: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.dangerSoft,
    backgroundColor: brand.card,
  },
  pressed: { opacity: 0.7 },
});
