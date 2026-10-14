import type { TFunction } from 'i18next';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { EmptyView, ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import type { CourseSummary } from '@/lib/types';
import { useTranslation } from 'react-i18next';

function statusChip(status: string, t: TFunction): { text: string; tone: 'green' | 'grey' | 'blue' } {
  if (status === 'OPEN') return { text: t('m_in_progress'), tone: 'green' };
  if (status === 'COMPLETED') return { text: t('event_completed'), tone: 'grey' };
  return { text: t('crs_status_planned'), tone: 'blue' };
}

export default function CoursesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, error, loading, refreshing, reload, retry } = useApi<CourseSummary[]>(
    '/api/course/semester-courses/my-attendance-summary/',
  );

  if (loading && !data) {
    return (
      <Screen title={t('adm_nav_courses')}>
        <LoadingView />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen title={t('adm_nav_courses')}>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  }

  const courses = data ?? [];

  return (
    <Screen title={t('adm_nav_courses')} subtitle={t('m_courses_subtitle')} onRefresh={reload} refreshing={refreshing}>
      {courses.length === 0 ? (
        <EmptyView icon="school" message={t('m_no_courses')} />
      ) : (
        courses.map((course) => {
          const chip = statusChip(course.status, t);
          return (
            <Card
              key={course.semester_course}
              style={styles.card}
              onPress={() =>
                router.push({ pathname: '/courses/[id]', params: { id: course.semester_course } })
              }>
              <View style={styles.top}>
                <IconBadge name="menu-book" />
                <View style={styles.titleBox}>
                  <AppText variant="heading" numberOfLines={2}>
                    {course.course_title}
                  </AppText>
                  <AppText variant="caption" color={brand.muted}>
                    {t('m_semester', { year: course.academic_year, n: course.semester })}
                  </AppText>
                </View>
                <Chip text={chip.text} tone={chip.tone} />
              </View>

              <ProgressBar percent={course.percentage} />

              <View style={styles.bottom}>
                <AppText variant="bodyStrong">{course.sessions_held > 0 ? `${course.percentage}%` : '-'}</AppText>
                <AppText variant="caption" color={brand.muted}>
                  {course.sessions_held > 0
                    ? t('m_present_of', { present: course.present, held: course.sessions_held })
                    : t('m_no_class_held')}
                </AppText>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleBox: { flex: 1, gap: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
