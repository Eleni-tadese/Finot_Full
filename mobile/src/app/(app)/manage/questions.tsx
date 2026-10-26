import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand, font } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { ApiError, apiRequest } from '@/lib/api';
import { timeAgo } from '@/lib/time-ago';
import { hasRole, ROLES } from '@/lib/roles';
import { useSession } from '@/lib/session';
import type { PendingAnswer, PrivateQuestion, PublicQuestion } from '@/lib/types';
import { useTranslation } from 'react-i18next';

type Tab = 'questions' | 'answers' | 'private';

// Step R5: questions for the QA Moderator (approve public questions and answers) and the QA Counselor (answer the
// private questions in their queue). The server decides who sees what: the counselor's list already hides the asker's
// real name unless the student chose to be named.
export default function ManageQuestions() {
  const { t } = useTranslation();
  const { accessToken, user } = useSession();
  const isModerator = hasRole(user, ROLES.qaModerator);
  const isCounselor = hasRole(user, ROLES.qaCounselor);
  const tabs: Tab[] = [...(isModerator ? (['questions', 'answers'] as Tab[]) : []), ...(isCounselor ? (['private'] as Tab[]) : [])];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? 'questions');

  // Only the active tab loads (a null path loads nothing).
  const questions = useApi<PublicQuestion[]>(tab === 'questions' && isModerator ? '/api/qa/questions/moderation-queue/' : null);
  const answers = useApi<PendingAnswer[]>(tab === 'answers' && isModerator ? '/api/qa/answers/pending/' : null);
  const priv = useApi<PrivateQuestion[]>(tab === 'private' && isCounselor ? '/api/qa/questions/counselor-queue/' : null);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  async function post(path: string, body: unknown, key: string, okText: string, reload: () => void) {
    setBusy(key);
    setNote(null);
    try {
      await apiRequest(path, { method: 'POST', body, token: accessToken });
      setNote({ ok: true, text: okText });
      reload();
      return true;
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError ? e.message : t('att_err_generic') });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function confirmApprove(path: string, key: string, reload: () => void) {
    Alert.alert(t('mng_q_approve'), t('mng_q_approve_confirm'), [
      { text: t('mng_cancel'), style: 'cancel' },
      { text: t('mng_q_approve'), onPress: () => post(path, {}, key, t('mng_q_approved'), reload) },
    ]);
  }

  async function sendAnswer(question: PrivateQuestion) {
    const name = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || 'Finot';
    const sent = await post(
      '/api/qa/answers/',
      { question: question.id, display_name: name, answer_body: reply.trim() },
      question.id,
      t('mng_q_sent'),
      priv.reload,
    );
    if (sent) {
      setReply('');
      setReplyFor(null);
    }
  }

  const active = tab === 'questions' ? questions : tab === 'answers' ? answers : priv;

  return (
    <Screen title={t('mng_sec_questions')} onRefresh={active.reload} refreshing={active.refreshing}>
      {tabs.length > 1 ? (
        <View style={styles.tabs}>
          {tabs.map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tabItem, tab === k && styles.tabItemActive]}>
              <AppText variant="caption" color={tab === k ? '#ffffff' : brand.primary} style={styles.center}>
                {t(k === 'questions' ? 'mng_q_tab_questions' : k === 'answers' ? 'mng_q_tab_answers' : 'mng_q_tab_private')}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {tab === 'private' ? (
        <AppText variant="caption" color={brand.muted}>
          {t('mng_q_private_note')}
        </AppText>
      ) : null}

      {note ? (
        <Card style={[styles.gap, { borderColor: note.ok ? brand.success : brand.danger, borderWidth: 1.5 }]}>
          <AppText variant="bodyStrong" color={note.ok ? brand.success : brand.danger}>
            {note.text}
          </AppText>
        </Card>
      ) : null}

      {active.loading && !active.data ? <LoadingView /> : null}
      {active.error && !active.data ? <ErrorView message={active.error.message} onRetry={active.retry} /> : null}
      {active.data && active.data.length === 0 ? <EmptyView icon="check-circle" message={t('mng_q_none')} /> : null}

      {tab === 'questions'
        ? (questions.data ?? []).map((q) => (
            <Card key={q.id} style={styles.gap}>
              <View style={styles.chips}>
                <Chip text={q.category} tone="blue" />
                <Chip text={timeAgo(q.created_at)} tone="grey" />
              </View>
              <AppText variant="caption" color={brand.muted}>
                {t('mng_q_asker', { name: q.display_name })}
              </AppText>
              <AppText>{q.question_body}</AppText>
              <Pressable
                style={[styles.button, busy === q.id && styles.disabled]}
                disabled={busy !== null}
                onPress={() => confirmApprove(`/api/qa/questions/${q.id}/approve/`, q.id, questions.reload)}>
                <AppText variant="bodyStrong" color="#ffffff">
                  {t('mng_q_approve')}
                </AppText>
              </Pressable>
            </Card>
          ))
        : null}

      {tab === 'answers'
        ? (answers.data ?? []).map((a) => (
            <Card key={a.id} style={styles.gap}>
              <View style={styles.chips}>
                <Chip text={a.question_category} tone="blue" />
                <Chip text={timeAgo(a.created_at)} tone="grey" />
              </View>
              <AppText variant="caption" color={brand.muted}>
                {a.question_body}
              </AppText>
              <View style={styles.answerBox}>
                <AppText variant="caption" color={brand.muted}>
                  {t('mng_q_from', { name: a.display_name })}
                </AppText>
                <AppText>{a.answer_body}</AppText>
              </View>
              <Pressable
                style={[styles.button, busy === String(a.id) && styles.disabled]}
                disabled={busy !== null}
                onPress={() => confirmApprove(`/api/qa/answers/${a.id}/approve/`, String(a.id), answers.reload)}>
                <AppText variant="bodyStrong" color="#ffffff">
                  {t('mng_q_approve')}
                </AppText>
              </Pressable>
            </Card>
          ))
        : null}

      {tab === 'private'
        ? (priv.data ?? []).map((q) => {
            const answered = q.answer_count > 0;
            const open = replyFor === q.id;
            return (
              <Card key={q.id} style={styles.gap}>
                <View style={styles.chips}>
                  <Chip text={q.category} tone="blue" />
                  <Chip text={answered ? t('mng_q_answered') : t('mng_q_waiting')} tone={answered ? 'green' : 'amber'} />
                  <Chip text={timeAgo(q.created_at)} tone="grey" />
                </View>
                <AppText variant="caption" color={brand.muted}>
                  {t('mng_q_asker', { name: q.asker_name || q.display_name })}
                </AppText>
                <AppText>{q.question_body}</AppText>
                {(q.answers ?? []).map((a) => (
                  <View key={a.id} style={styles.answerBox}>
                    <AppText variant="caption" color={brand.muted}>
                      {t('mng_q_from', { name: a.display_name })}
                    </AppText>
                    <AppText>{a.answer_body}</AppText>
                  </View>
                ))}
                {open ? (
                  <>
                    <TextInput
                      value={reply}
                      onChangeText={setReply}
                      multiline
                      placeholder={t('mng_q_placeholder')}
                      placeholderTextColor={brand.muted}
                      style={styles.input}
                    />
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.button, styles.flex, (reply.trim().length === 0 || busy !== null) && styles.disabled]}
                        disabled={reply.trim().length === 0 || busy !== null}
                        onPress={() => sendAnswer(q)}>
                        <AppText variant="bodyStrong" color="#ffffff">
                          {t('mng_q_send')}
                        </AppText>
                      </Pressable>
                      <Pressable
                        style={styles.outline}
                        onPress={() => {
                          setReplyFor(null);
                          setReply('');
                        }}>
                        <AppText variant="bodyStrong" color={brand.primary}>
                          {t('mng_cancel')}
                        </AppText>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Pressable
                    style={styles.outline}
                    onPress={() => {
                      setReplyFor(q.id);
                      setReply('');
                    }}>
                    <View style={styles.row}>
                      <MaterialIcons name="reply" size={18} color={brand.primary} />
                      <AppText variant="bodyStrong" color={brand.primary}>
                        {t('mng_q_answer')}
                      </AppText>
                    </View>
                  </Pressable>
                )}
              </Card>
            );
          })
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  gap: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tabs: { flexDirection: 'row', gap: 8 },
  tabItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, borderColor: brand.primary, justifyContent: 'center' },
  tabItemActive: { backgroundColor: brand.primary },
  answerBox: { backgroundColor: brand.primarySoft, borderRadius: 12, padding: 12, gap: 4 },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  outline: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: brand.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 },
  disabled: { opacity: 0.45 },
  input: {
    minHeight: 110,
    textAlignVertical: 'top',
    fontFamily: font.regular,
    color: brand.text,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: brand.background,
  },
});
