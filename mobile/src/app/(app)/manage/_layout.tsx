import { Stack } from 'expo-router';

import { brand, font } from '@/constants/brand';
import { useTranslation } from 'react-i18next';

// The Manage tab is a pile of screens like Events: the home is the first one, the tools of R2-R5 go on top of it.
export default function ManageLayout() {
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
      <Stack.Screen name="events" options={{ title: t('mng_sec_event_attendance') }} />
      <Stack.Screen name="room" options={{ title: t('mng_room_title') }} />
    </Stack>
  );
}
