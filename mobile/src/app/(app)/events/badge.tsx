import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { brand } from '@/constants/brand';
import { ApiError, apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';
import { loadBadge, saveBadge } from '@/lib/storage';
import type { MyBadge } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// My badge: the personal QR the organizer scans at the door. The text inside the QR is signed by the server
// (FB1.<id>.<version>.<signature>), so showing it needs no network: we keep the last one on the phone and
// draw it again even when the server cannot be reached.
export default function MyBadgeScreen() {
  const { t } = useTranslation();
  const { accessToken } = useSession();
  const [badge, setBadge] = useState<MyBadge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    const kept = await loadBadge(); // what we saved last time, if anything
    if (kept) setBadge(kept);
    try {
      const fresh = await apiRequest<MyBadge>('/api/attendance/badge/me/', { token: accessToken });
      setBadge(fresh);
      await saveBadge(fresh); // a new badge (after "New badge" by the admin) replaces the old one
    } catch (e) {
      if (!kept) setError(e instanceof ApiError ? e.message : t('badge_failed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <Screen title={t('badge_title')} subtitle={t('badge_desc')} onRefresh={load} refreshing={loading && badge !== null}>
      {badge ? (
        <Card style={styles.card}>
          <View style={styles.qr}>
            <QRCode value={badge.badge} size={240} backgroundColor="#ffffff" color="#000000" />
          </View>
          <AppText variant="title" color={brand.primary} style={styles.name}>
            {badge.name}
          </AppText>
          <AppText variant="caption" color={brand.muted} style={styles.hint}>
            {t('badge_keep')}
          </AppText>
          <AppText variant="caption" color={brand.muted} style={styles.hint}>
            {t('m_badge_screenshot')}
          </AppText>
        </Card>
      ) : loading ? (
        <LoadingView />
      ) : (
        <ErrorView message={error ?? t('badge_failed')} onRetry={load} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  qr: { padding: 14, backgroundColor: '#ffffff', borderRadius: 16 },
  name: { textAlign: 'center' },
  hint: { textAlign: 'center' },
});
