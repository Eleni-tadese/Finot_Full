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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { brand } from '@/constants/brand';
import i18n, { LANGUAGES } from '@/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { loadLanguage } from '@/lib/storage';

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
  const { t } = useTranslation();
  const { isSignedIn, isLoading } = useSession();

  // Apply the language the person chose last time, before the first screen is drawn.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    loadLanguage()
      .then((code) => {
        if (code && LANGUAGES.some((language) => language.code === code)) {
          return i18n.changeLanguage(code);
        }
      })
      .catch(() => {})
      .finally(() => setLanguageReady(true));
  }, []);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const ready = fontsLoaded && !isLoading && languageReady;

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
        {/* The donation screens open on top of the tabs */}
        <Stack.Screen name="donate" />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        {/* The first screen of a signed-out visitor is the first one listed here: welcome */}
        <Stack.Screen name="welcome" />
        <Stack.Screen
          name="sign-in"
          options={{
            headerShown: true,
            headerTransparent: true, // the back arrow floats over the blue panel
            headerTitle: '',
            headerTintColor: '#ffffff',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="give"
          options={{
            headerShown: true,
            title: t('m_give'),
            headerStyle: { backgroundColor: brand.card },
            headerTintColor: brand.primary,
            headerShadowVisible: false,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
