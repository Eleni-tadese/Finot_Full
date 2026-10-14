import { Stack } from 'expo-router';

// A "stack" is a pile of screens: opening an event puts the detail screen ON TOP of the list,
// and the back button (or swipe) takes it off again. This folder is one tab of the app.
export default function EventsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="attendance" options={{ title: 'My attendance' }} />
      <Stack.Screen name="[id]" options={{ title: 'Event' }} />
    </Stack>
  );
}
