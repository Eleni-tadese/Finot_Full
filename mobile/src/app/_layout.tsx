import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { brand } from '@/constants/brand';
import { SessionProvider, useSession } from '@/lib/session';

// Keep the splash screen (the logo shown while the app starts) until the fonts are loaded
// and we know if somebody is signed in.
SplashScreen.preventAutoHideAsync();

// The app is light only for now: the Finot brand colours are drawn for a white background.
const finotTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: brand.background, primary: brand.primary, card: brand.card },
};

// The root layout wraps EVERY screen of the app.
export default function RootLayout() {
  return (
    <ThemeProvider value={finotTheme}>
      <StatusBar style="dark" />
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { isSignedIn, isLoading } = useSession();

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const ready = fontsLoaded && !isLoading;

  // Once the fonts and the saved session are ready, show the right screen by hiding the splash.
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
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
