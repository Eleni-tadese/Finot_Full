import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand, font } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { EmailStatus } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Step R4 (Super Admin): the email outbox. Events and reminders wait in it and go out up to the daily limit.
// The same actions as the website's Messages > Email: Send now, Retry failed, change the daily limit.
export default function ManageEmail() {
  const { t } = useTranslation();
  const { accessToken } = useSession();
  const status = useApi<EmailStatus>('/api/admin-console/email/settings/');
  const [limit, setLimit] = useState<string | null>(null); // null = untouched: show the saved value
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function call<T>(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T | null> {
    setBusy(true);
    setNote(null);
    try {
      return await apiRequest<T>(path, { method, body, token: accessToken });
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError ? e.message : t('att_err_generic') });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    const res = await call('/api/admin-console/email/outbox/send/', 'POST', {});
    if (res !== null) {
      setNote({ ok: true, text: t('mng_em_started') });
      setTimeout(status.reload, 8000); // the server sends in the background: look again a few seconds later
    }
  }

  async function retry() {
    const res = await call<{ retried: number }>('/api/admin-console/email/outbox/retry/', 'POST', {});
    if (res) {
      setNote({ ok: true, text: t('mng_em_retried', { n: res.retried }) });
      status.reload();
    }
  }

  async function saveLimit() {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      setNote({ ok: false, text: t('mng_em_limit_bad') });
      return;
    }
    const res = await call<EmailStatus>('/api/admin-console/email/settings/', 'PATCH', { daily_limit: n });
    if (res) {
      setLimit(null);
      setNote({ ok: true, text: t('mng_em_saved') });
      status.reload();
    }
  }

  if (status.loading && !status.data) {
    return (
      <Screen title={t('mng_sec_email')}>
        <LoadingView />
      </Screen>
    );
  }
  if (status.error && !status.data) {
    return (
      <Screen title={t('mng_sec_email')}>
        <ErrorView message={status.error.message} onRetry={status.retry} />
      </Screen>
    );
  }
  const s = status.data;
  if (!s) return null;

  return (
    <Screen title={t('mng_sec_email')} subtitle={t('mng_em_desc')} onRefresh={status.reload} refreshing={status.refreshing}>
      <Card style={styles.card}>
        <AppText variant="title" color={brand.primary}>
          {t('mng_em_sent_today')}: {s.sent_today} / {s.daily_limit}
        </AppText>
        <AppText color={brand.muted}>
          {t('mng_em_left')}: {s.remaining_today}
        </AppText>
        <View style={styles.chips}>
          <Chip text={`${t('mng_em_waiting')}: ${s.waiting}`} tone="amber" />
          <Chip text={`${t('mng_em_failed')}: ${s.failed}`} tone={s.failed > 0 ? 'red' : 'grey'} />
          <Chip text={`${t('mng_em_skipped')}: ${s.skipped}`} tone="grey" />
          <Chip text={`${t('mng_em_sent_total')}: ${s.sent}`} tone="green" />
        </View>
        <AppText variant="caption" color={brand.muted}>
          {s.test_notice ? t('mng_em_notice_on') : t('mng_em_notice_off')}
        </AppText>
      </Card>

      {note ? (
        <Card style={[styles.card, { borderColor: note.ok ? brand.success : brand.danger, borderWidth: 1.5 }]}>
          <AppText variant="bodyStrong" color={note.ok ? brand.success : brand.danger}>
            {note.text}
          </AppText>
        </Card>
      ) : null}

      <Pressable style={[styles.button, (busy || s.waiting === 0) && styles.disabled]} disabled={busy || s.waiting === 0} onPress={sendNow}>
        <AppText variant="bodyStrong" color="#ffffff">
          {t('mng_em_send_now')}
        </AppText>
      </Pressable>
      <Pressable style={[styles.outline, (busy || s.failed === 0) && styles.disabled]} disabled={busy || s.failed === 0} onPress={retry}>
        <AppText variant="bodyStrong" color={brand.primary}>
          {t('mng_em_retry')}
        </AppText>
      </Pressable>

      <Card style={styles.card}>
        <AppText variant="label" color={brand.muted}>
          {t('mng_em_limit_label')}
        </AppText>
        <TextInput
          value={limit ?? String(s.daily_limit)}
          onChangeText={(v) => setLimit(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Pressable
          style={[styles.button, (busy || limit === null) && styles.disabled]}
          disabled={busy || limit === null}
          onPress={() =>
            Alert.alert(t('mng_em_limit_label'), t('mng_em_limit_confirm', { n: limit }), [
              { text: t('mng_cancel'), style: 'cancel' },
              { text: t('mng_em_save'), onPress: saveLimit },
            ])
          }>
          <AppText variant="bodyStrong" color="#ffffff">
            {t('mng_em_save')}
          </AppText>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, paddingVertical: 14, borderRadius: 14 },
  outline: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: brand.primary, paddingVertical: 14, borderRadius: 14 },
  disabled: { opacity: 0.45 },
  input: {
    fontFamily: font.bold,
    fontSize: 28,
    textAlign: 'center',
    color: brand.text,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: brand.background,
  },
});
