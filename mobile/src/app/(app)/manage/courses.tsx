import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { usePaginated } from '@/hooks/use-paginated';
import { hasRole, ROLES } from '@/lib/roles';
import { useSession } from '@/lib/session';
import type { CoordinatedCourse } from '@/lib/types';
import { useTranslation } from 'react-i18next';

// Step R3: the courses this person coordinates. The server sends the courses where they are named AND the ones they
// study in, so the phone keeps the ones that name them as coordinator (the Super Admin sees all). Finished courses are left out.
export default function ManageCourses() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const courses = usePaginated<CoordinatedCourse>('/api/course/semester-courses/');
  const everything = hasRole(user, ROLES.superAdmin);

  const mine = useMemo(
    () => courses.items.filter((c) => c.status !== 'COMPLETED' && (everything || (user ? c.coordinators.includes(user.id) : false))),
    [courses.items, everything, user],
  );

  if (courses.loading && courses.items.length === 0) return <LoadingView />;
  if (courses.error && courses.items.length === 0) return <ErrorView message={courses.error.message} onRetry={courses.retry} />;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={mine}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshing={courses.refreshing}
        onRefresh={courses.reload}
        onEndReached={courses.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={<EmptyView icon="school" message={t('mng_no_courses')} />}
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            onPress={() =>
              router.push({ pathname: '/manage/days', params: { course: item.id, title: item.course_details.title } } as never)
            }>
            <IconBadge name="school" />
            <View style={styles.text}>
              <AppText variant="heading" numberOfLines={2}>
                {item.course_details.title}
              </AppText>
              <AppText variant="caption" color={brand.muted}>
                {t('mng_course_meta', { year: item.course_details.batch_year, sem: item.semester, n: item.enrollment_count })}
              </AppText>
              <View style={styles.chips}>
                <Chip text={item.status === 'OPEN' ? t('m_in_progress') : t('crs_status_planned')} tone={item.status === 'OPEN' ? 'green' : 'blue'} />
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={brand.muted} />
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.background },
  list: { padding: 20, gap: 12, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 2 },
});
