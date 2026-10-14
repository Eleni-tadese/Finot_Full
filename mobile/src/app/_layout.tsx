import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SessionProvider, useSession } from '@/lib/session';

// Keep the splash screen (the logo shown while the app starts) until we know if somebody is signed in.
SplashScreen.preventAutoHideAsync();

// The root layout wraps EVERY screen of the app.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isSignedIn, isLoading } = useSession();

  // Once the saved session has been checked, show the right screen by hiding the splash.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null; // the splash screen is still covering the app
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Signed in: the (app) group (the tabs). Signed out: only the sign-in screen exists. */}
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
