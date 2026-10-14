import { Stack } from 'expo-router';

import { brand, font } from '@/constants/brand';

// A "stack" is a pile of screens: opening an event puts the detail screen ON TOP of the list,
// and the back button (or swipe) takes it off again. This folder is one tab of the app.
export default function EventsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.card },
        headerTintColor: brand.primary, // the back arrow
        headerTitleStyle: { fontFamily: font.semibold, color: brand.primary },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: brand.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="attendance" options={{ title: 'My attendance' }} />
      <Stack.Screen name="[id]" options={{ title: 'Event' }} />
    </Stack>
  );
}
