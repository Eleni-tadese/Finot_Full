import type { ReactNode } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { timeAgo } from '@/lib/time-ago';
import type { FamilyChild, FamilyPerson, MyFamily } from '@/lib/types';

// A father or mother: name, and tap to call or write.
function ParentCard({ label, person }: { label: string; person: FamilyPerson | null }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.person}>
      <Avatar name={person?.name ?? '?'} size={48} />
      <View style={styles.personText}>
        <AppText variant="label" color={brand.muted}>
          {label}
        </AppText>
        {person ? (
          <>
            <AppText variant="bodyStrong">{person.name}</AppText>
            {person.phone ? (
              <AppText color={brand.primary} onPress={() => Linking.openURL(`tel:${person.phone}`)}>
                {person.phone}
              </AppText>
            ) : null}
            {person.email ? (
              <AppText color={brand.primary} onPress={() => Linking.openURL(`mailto:${person.email}`)}>
                {person.email}
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText color={brand.muted}>{t('fam_not_named')}</AppText>
        )}
      </View>
    </Card>
  );
}

// A brother, a sister or a child of the family.
function MemberRow({ member, showMore }: { member: FamilyChild; showMore: boolean }) {
  const { t } = useTranslation();
  const course = member.course_attendance;
  return (
    <Card style={styles.person}>
      <Avatar name={member.name} size={44} />
      <View style={styles.personText}>
        <AppText variant="bodyStrong">{member.name}</AppText>
        <AppText variant="caption" color={brand.muted}>
          {[member.year ? t('fam_year_n', { n: member.year }) : null, member.department].filter(Boolean).join(' · ')}
        </AppText>
        {member.phone ? (
          <AppText color={brand.primary} onPress={() => Linking.openURL(`tel:${member.phone}`)}>
            {member.phone}
          </AppText>
        ) : null}
        {showMore && course?.percentage != null ? (
          <Chip text={t('fam_classes_pct', { n: course.percentage })} tone={course.percentage >= 75 ? 'green' : 'amber'} />
        ) : null}
      </View>
    </Card>
  );
}

// The page frame. The back arrow and the title come from the header (see app/_layout.tsx), so no Screen here.
function Page({ children, onRefresh, refreshing = false }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brand.primary]} tintColor={brand.primary} /> : undefined
      }>
      {children}
    </ScrollView>
  );
}

export default function FamilyScreen() {
  const { t } = useTranslation();
  const { data: family, error, loading, refreshing, reload, retry } = useApi<MyFamily>('/api/service/families/my-family/');

  if (loading && !family) {
    return (
      <Page>
        <LoadingView />
      </Page>
    );
  }

  // 404 is not a fault: the person simply has no family yet.
  if (error && !family) {
    return (
      <Page>
        {error.status === 404 ? (
          <EmptyView icon="groups" message={t('fam_none_yet')} />
        ) : (
          <ErrorView message={error.message} onRetry={retry} />
        )}
      </Page>
    );
  }

  if (!family) return null;

  const isParent = family.my_role !== 'child';
  const members = isParent ? family.children : family.siblings;

  return (
    <Page onRefresh={reload} refreshing={refreshing}>
      <View>
        <AppText variant="title">{family.name}</AppText>
        <AppText color={brand.muted}>{t('fam_members_n', { n: family.member_count })}</AppText>
      </View>
      {family.religious_father ? (
        <Card>
          <AppText variant="label" color={brand.muted}>
            {t('fam_confession_father')}
          </AppText>
          <AppText variant="bodyStrong">{family.religious_father}</AppText>
        </Card>
      ) : null}

      <ParentCard label={t('fam_father')} person={family.father} />
      <ParentCard label={t('fam_mother')} person={family.mother} />

      <AppText variant="heading" style={styles.section}>
        {isParent ? t('fam_children') : t('fam_siblings')}
      </AppText>
      {members.length === 0 ? (
        <Card>
          <AppText color={brand.muted}>{t('fam_nobody')}</AppText>
        </Card>
      ) : (
        members.map((m) => <MemberRow key={m.id} member={m} showMore={isParent} />)
      )}

      <AppText variant="heading" style={styles.section}>
        {t('fam_messages')}
      </AppText>
      {family.messages.length === 0 ? (
        <Card>
          <AppText color={brand.muted}>{t('fam_no_messages')}</AppText>
        </Card>
      ) : (
        family.messages.map((m) => (
          <Card key={m.id} style={styles.message}>
            <AppText variant="caption" color={brand.muted}>
              {(m.mine ? t('fam_you') : (m.sender ?? '')) + (m.to ? ` → ${m.to}` : '') + ` · ${timeAgo(m.created_at)}`}
            </AppText>
            <AppText>{m.body}</AppText>
          </Card>
        ))
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  section: { marginTop: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  personText: { flex: 1, gap: 2 },
  message: { gap: 4 },
});
