import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorView, LoadingView } from '@/components/status-views';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { brand } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { usePaginated } from '@/hooks/use-paginated';
import { etToday, plainDate } from '@/lib/ethiopia-time';
import type {
  CourseAttendanceRecord,
  CourseSession,
  CourseSummary,
  Material,
  Paginated,
  SemesterCourseDetail,
} from '@/lib/types';

// Keep asking the server for the next page until the list is complete (class days are few).
function useLoadAll(hasMore: boolean, loading: boolean, loadingMore: boolean, loadMore: () => void) {
  useEffect(() => {
    if (hasMore && !loading && !loadingMore) {
      loadMore();
    }
  });
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={styles.stat}>
      <AppText variant="display" color={color}>
        {value}
      </AppText>
      <AppText variant="label" color={brand.muted}>
        {label}
      </AppText>
    </Card>
  );
}

export default function CourseDetailScreen() {
  // The file is [id].tsx, so /courses/<uuid> gives us the semester course id.
  const { id } = useLocalSearchParams<{ id: string }>();

  const course = useApi<SemesterCourseDetail>(`/api/course/semester-courses/${id}/`);
  const summaries = useApi<CourseSummary[]>('/api/course/semester-courses/my-attendance-summary/');
  const sessions = usePaginated<CourseSession>(`/api/course/sessions/?semester_course=${id}`);
  const records = usePaginated<CourseAttendanceRecord>('/api/course/attendance/?mine=1');

  useLoadAll(sessions.hasMore, sessions.loading, sessions.loadingMore, sessions.loadMore);
  useLoadAll(records.hasMore, records.loading, records.loadingMore, records.loadMore);

  // The materials need the curriculum id, which we only know after the course has loaded.
  const curriculumId = course.data?.course;
  const materials = useApi<Paginated<Material>>(
    curriculumId ? `/api/resources/materials/?course=${curriculumId}` : '/api/resources/materials/?course=none',
  );

  const summary = summaries.data?.find((item) => item.semester_course === id);

  // class day id -> my status. useMemo = only rebuild when the records change.
  const statusBySession = useMemo(() => {
    const map = new Map<string, string>();
    records.items.forEach((record) => map.set(record.session, record.status));
    return map;
  }, [records.items]);

  // Oldest class day first, like a timetable.
  const classDays = useMemo(
    () => [...sessions.items].sort((a, b) => a.date.localeCompare(b.date)),
    [sessions.items],
  );

  if (course.loading && !course.data) {
    return (
      <Screen>
        <LoadingView label="Loading course..." />
      </Screen>
    );
  }
  if (course.error && !course.data) {
    return (
      <Screen>
        <ErrorView message={course.error.message} onRetry={course.retry} />
      </Screen>
    );
  }
  if (!course.data) {
    return null;
  }

  const today = etToday();
  const held = summary?.sessions_held ?? 0;
  const percentage = summary?.percentage ?? 0;
  const materialList = curriculumId ? (materials.data?.results ?? []) : [];

  function reloadAll() {
    course.reload();
    summaries.reload();
    sessions.reload();
    records.reload();
    materials.reload();
  }

  return (
    <Screen onRefresh={reloadAll} refreshing={course.refreshing}>
      <Chip text={`${course.data.academic_year} · Semester ${course.data.semester}`} tone="blue" />
      <AppText variant="display" color={brand.primary}>
        {course.data.course_details.title}
      </AppText>
      {course.data.course_details.description ? (
        <AppText color={brand.muted}>{course.data.course_details.description}</AppText>
      ) : null}

      {/* My attendance in this course */}
      <Card style={styles.progressCard}>
        <View style={styles.progressTop}>
          <AppText variant="heading">My attendance</AppText>
          <AppText variant="title" color={brand.primary}>
            {held > 0 ? `${percentage}%` : '-'}
          </AppText>
        </View>
        <ProgressBar percent={percentage} />
        <AppText variant="caption" color={brand.muted}>
          {held > 0 ? `Present ${summary?.present ?? 0} of ${held} classes held` : 'No class has been held yet.'}
        </AppText>
      </Card>

      <View style={styles.stats}>
        <Stat label="Present" value={String(summary?.present ?? 0)} color={brand.success} />
        <Stat label="Absent" value={String(summary?.absent ?? 0)} color={brand.danger} />
        <Stat label="Classes" value={String(classDays.length)} color={brand.primary} />
      </View>

      {/* Class days */}
      <AppText variant="heading" style={styles.section}>
        Class days
      </AppText>
      {sessions.loading && classDays.length === 0 ? (
        <LoadingView label="Loading class days..." />
      ) : classDays.length === 0 ? (
        <Card>
          <AppText color={brand.muted}>No class days have been planned yet.</AppText>
        </Card>
      ) : (
        classDays.map((day) => {
          const mine = statusBySession.get(day.id);
          const isFuture = day.date > today;
          let chip: { text: string; tone: 'green' | 'red' | 'grey' | 'blue' };
          if (mine === 'PRESENT') chip = { text: 'Present', tone: 'green' };
          else if (mine === 'ABSENT') chip = { text: 'Absent', tone: 'red' };
          else if (isFuture) chip = { text: 'Upcoming', tone: 'blue' };
          else if (day.date === today) chip = { text: 'Today', tone: 'blue' };
          else chip = { text: 'Not marked', tone: 'grey' };

          return (
            <Card key={day.id} style={styles.dayRow}>
              <IconBadge name="event" size={40} />
              <View style={styles.dayText}>
                <AppText variant="bodyStrong">{plainDate(day.date)}</AppText>
                {day.topic ? (
                  <AppText variant="caption" color={brand.text}>
                    {day.topic}
                  </AppText>
                ) : null}
                {day.teacher_name ? (
                  <AppText variant="caption" color={brand.muted}>
                    {day.teacher_name}
                  </AppText>
                ) : null}
              </View>
              <Chip text={chip.text} tone={chip.tone} />
            </Card>
          );
        })
      )}

      {/* Materials */}
      <AppText variant="heading" style={styles.section}>
        Materials
      </AppText>
      {materialList.length === 0 ? (
        <Card>
          <AppText color={brand.muted}>No materials have been shared for this course.</AppText>
        </Card>
      ) : (
        materialList.map((material) => {
          const address = material.file ?? material.url;
          return (
            <Card
              key={material.id}
              style={styles.dayRow}
              // Linking.openURL hands the address to the phone: a PDF opens in the browser or a PDF app.
              onPress={address ? () => Linking.openURL(address) : undefined}>
              <IconBadge name={material.file ? 'description' : 'link'} size={40} />
              <View style={styles.dayText}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {material.title}
                </AppText>
                {material.description ? (
                  <AppText variant="caption" color={brand.muted} numberOfLines={2}>
                    {material.description}
                  </AppText>
                ) : null}
              </View>
              {address ? <MaterialIcons name="open-in-new" size={20} color={brand.muted} /> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: { gap: 10 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 14, paddingHorizontal: 8 },
  section: { marginTop: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayText: { flex: 1, gap: 1 },
});
