import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { MaterialIcons } from '@expo/vector-icons';
import { DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
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

// `anchor`: the screen that always sits UNDER the others, even when the app is opened straight on a deeper
// address such as /give. Without it that screen would be alone in the pile and have no back arrow.
export const unstable_settings = { anchor: 'welcome' };

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
  const router = useRouter();

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
        {/* My family: opens on top of the tabs, with a back arrow */}
        <Stack.Screen
          name="family"
          options={{
            headerShown: true,
            title: t('fam_title'),
            headerStyle: { backgroundColor: brand.card },
            headerTintColor: brand.primary,
            headerShadowVisible: false,
          }}
        />
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
          options={({ navigation }) => ({
            headerShown: true,
            title: t('m_give'),
            headerStyle: { backgroundColor: brand.card },
            headerTintColor: brand.primary,
            headerShadowVisible: false,
            // Safety net: if Give is the only screen, still offer a way out to Welcome.
            headerLeft: navigation.canGoBack()
              ? undefined
              : () => (
                  <Pressable onPress={() => router.replace('/welcome')} hitSlop={12}>
                    <MaterialIcons name="arrow-back" size={24} color={brand.primary} />
                  </Pressable>
                ),
          })}
        />
      </Stack.Protected>
    </Stack>
  );
}
