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

function statusChip(status: string): { text: string; tone: 'green' | 'grey' | 'blue' } {
  if (status === 'OPEN') return { text: 'In progress', tone: 'green' };
  if (status === 'COMPLETED') return { text: 'Completed', tone: 'grey' };
  return { text: 'Not started', tone: 'blue' };
}

export default function CoursesScreen() {
  const router = useRouter();
  const { data, error, loading, refreshing, reload, retry } = useApi<CourseSummary[]>(
    '/api/course/semester-courses/my-attendance-summary/',
  );

  if (loading && !data) {
    return (
      <Screen title="Courses">
        <LoadingView label="Loading your courses..." />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen title="Courses">
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  }

  const courses = data ?? [];

  return (
    <Screen title="Courses" subtitle="Your classes and attendance" onRefresh={reload} refreshing={refreshing}>
      {courses.length === 0 ? (
        <EmptyView icon="school" message="You are not enrolled in a course yet. Courses appear here when they open." />
      ) : (
        courses.map((course) => {
          const chip = statusChip(course.status);
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
                    {course.academic_year} · Semester {course.semester}
                  </AppText>
                </View>
                <Chip text={chip.text} tone={chip.tone} />
              </View>

              <ProgressBar percent={course.percentage} />

              <View style={styles.bottom}>
                <AppText variant="bodyStrong">{course.sessions_held > 0 ? `${course.percentage}%` : '-'}</AppText>
                <AppText variant="caption" color={brand.muted}>
                  {course.sessions_held > 0
                    ? `Present ${course.present} of ${course.sessions_held} classes`
                    : 'No class held yet'}
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
