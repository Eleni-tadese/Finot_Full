import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import type { AdminOverview } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// One number with its label, in a row of a card.
function Row({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText color={brand.muted} style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={warn ? brand.danger : brand.text}>
        {value}
      </AppText>
    </View>
  );
}

const money = (v: number | string) => Number(v).toLocaleString();

// Step R4 (Super Admin): the same numbers as the website's Overview, read from /api/admin-console/overview/.
// The server refuses anyone who is not the Super Admin, so this screen only reads and shows.
export default function ManageOverview() {
  const { t } = useTranslation();
  const { data, error, loading, refreshing, reload, retry } = useApi<AdminOverview>('/api/admin-console/overview/');

  if (loading && !data) {
    return (
      <Screen title={t('mng_sec_overview')}>
        <LoadingView />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen title={t('mng_sec_overview')}>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  }
  if (!data) return null;

  return (
    <Screen title={t('mng_sec_overview')} onRefresh={reload} refreshing={refreshing}>
      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_ov_users')}</AppText>
        <Row label={t('mng_ov_real')} value={`${data.users.real_active} / ${data.users.real}`} />
        <Row label={t('mng_ov_slips_used')} value={data.users.slips_used} />
        <Row label={t('mng_ov_slips_unused')} value={data.users.slips_unused} />
        <Row label={t('mng_ov_students')} value={data.users.students} />
      </Card>

      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_ov_events')}</AppText>
        <Row label={t('mng_ov_upcoming')} value={data.events.upcoming} />
        <Row label={t('mng_ov_total')} value={data.events.total} />
      </Card>

      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_ov_qa')}</AppText>
        <Row label={t('mng_ov_public_pending')} value={data.qa.public_pending} warn={data.qa.public_pending > 0} />
        <Row label={t('mng_ov_private_unanswered')} value={data.qa.private_unanswered} warn={data.qa.private_unanswered > 0} />
        <Row label={t('mng_ov_needs_assignment')} value={data.qa.needs_assignment} warn={data.qa.needs_assignment > 0} />
      </Card>

      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_ov_families')}</AppText>
        <Row label={t('mng_ov_families_total')} value={data.families.total} />
        <Row label={t('mng_ov_freshers')} value={data.families.unassigned_freshers} warn={data.families.unassigned_freshers > 0} />
      </Card>

      {data.donations ? (
        <Card style={styles.card}>
          <AppText variant="heading">{t('mng_ov_donations')}</AppText>
          <Row label={t('mng_ov_collected')} value={`${money(data.donations.collected)} ETB`} />
          <Row label={t('mng_ov_completed')} value={data.donations.completed} />
          <Row label={t('mng_ov_pending')} value={data.donations.pending} />
          <Row label={t('mng_ov_failed')} value={data.donations.failed} warn={data.donations.failed > 0} />
        </Card>
      ) : null}

      <Card style={styles.card}>
        <AppText variant="heading">{t('mng_ov_email')}</AppText>
        <Row label={t('mng_em_sent_today')} value={`${data.email.sent_today} / ${data.email.daily_limit}`} />
        <Row label={t('mng_em_waiting')} value={data.email.waiting} />
        <Row label={t('mng_em_failed')} value={data.email.failed} warn={data.email.failed > 0} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1 },
});
