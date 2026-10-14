import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { LanguagePicker } from '@/components/ui/language-picker';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useSession } from '@/lib/session';
import type { StudentProfile } from '@/lib/types';
import { useTranslation } from 'react-i18next';

type Icon = keyof typeof MaterialIcons.glyphMap;

// One row of a details card: an icon, a small label and the value ("Not set" when the student left it empty).
function Row({ icon, label, value }: { icon: Icon; label: string; value: string | number | null | undefined }) {
  const { t } = useTranslation();
  const empty = value === null || value === undefined || value === '';
  return (
    <View style={styles.row}>
      <IconBadge name={icon} size={40} />
      <View style={styles.rowText}>
        <AppText variant="label" color={brand.muted}>
          {label}
        </AppText>
        <AppText variant="bodyStrong" color={empty ? brand.muted : brand.text}>
          {empty ? t('usr_not_set') : value}
        </AppText>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const router = useRouter();
  const { data: profile, error, loading, refreshing, reload, retry } =
    useApi<StudentProfile>('/api/student/profiles/me/');

  // The three states, in order: loading, error, then the real screen.
  if (loading && !profile) {
    return (
      <Screen title={t('profile')}>
        <LoadingView />
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen title={t('profile')}>
        <ErrorView message={friendlyMessage(error.status, error.body, error.message, t)} onRetry={retry} />
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
    <Screen title={t('profile')} onRefresh={reload} refreshing={refreshing}>
      <Card style={styles.identity}>
        <Avatar name={fullName || profile.user_email} photo={profile.profile_image} size={84} />
        <AppText variant="title" style={styles.centerText}>
          {fullName || profile.user_email}
        </AppText>
        <AppText variant="caption" color={brand.muted}>
          {profile.user_email}
        </AppText>
        <Chip
          text={profile.status === 'GRADUATED' ? t('m_graduate') : t('in_campus')}
          tone={profile.status === 'GRADUATED' ? 'amber' : 'green'}
        />
      </Card>

      <AppText variant="heading" style={styles.section}>
        {t('m_study')}
      </AppText>
      <Card style={styles.group}>
        <Row icon="school" label={t('usr_year')} value={profile.batch_year ? t('m_year_n', { n: profile.batch_year }) : null} />
        <Row icon="account-balance" label={t('department')} value={profile.department} />
      </Card>

      <AppText variant="heading" style={styles.section}>
        {t('contact')}
      </AppText>
      <Card style={styles.group}>
        <Row icon="phone" label={t('phone')} value={profile.personal_phone} />
        <Row icon="send" label={t('telegram')} value={profile.telegram_username} />
        <Row icon="apartment" label={t('sp_dorm')} value={dorm} />
        <Row icon="home" label={t('home_address')} value={profile.home_address} />
      </Card>

      <AppText variant="heading" style={styles.section}>
        {t('m_language')}
      </AppText>
      <Card>
        <LanguagePicker />
      </Card>

      <AppText variant="heading" style={styles.section}>
        {t('m_giving')}
      </AppText>
      <Card style={styles.linkRow} onPress={() => router.push('/donate/history')}>
        <IconBadge name="volunteer-activism" size={40} />
        <View style={styles.rowText}>
          <AppText variant="bodyStrong">{t('m_my_donations')}</AppText>
          <AppText variant="caption" color={brand.muted}>
            {t('m_see_given')}
          </AppText>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={brand.muted} />
      </Card>

      <SignOutButton onPress={signOut} />
    </Screen>
  );
}

function SignOutButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable style={({ pressed }) => [styles.signOut, pressed && styles.pressed]} onPress={onPress}>
      <MaterialIcons name="logout" size={20} color={brand.danger} />
      <AppText variant="bodyStrong" color={brand.danger}>
        {t('logout')}
      </AppText>
    </Pressable>
  );
}

// The server sends a technical `code` for a student who has not finished the account set-up.
function friendlyMessage(status: number, body: unknown, fallback: string, t: TFunction): string {
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  if (code === 'account_setup_required') {
    return t('m_setup_required');
  }
  if (status === 404) {
    return t('m_no_profile');
  }
  return fallback;
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  centerText: { textAlign: 'center', marginTop: 6 },
  section: { marginTop: 8 },
  group: { gap: 16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
