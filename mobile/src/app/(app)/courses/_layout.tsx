import { Stack } from 'expo-router';

import { brand, font } from '@/constants/brand';
import { useTranslation } from 'react-i18next';

// The Courses tab: a list, and a detail screen that opens on top of it.
export default function CoursesLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.card },
        headerTintColor: brand.primary,
        headerTitleStyle: { fontFamily: font.semibold, color: brand.primary },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: brand.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: t('type_course') }} />
    </Stack>
  );
}
