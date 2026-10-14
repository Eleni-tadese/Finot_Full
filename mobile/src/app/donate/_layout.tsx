import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { brand, font } from '@/constants/brand';
import { useTranslation } from 'react-i18next';

// The donation screens sit OUTSIDE the tabs: they open on top of the app and have a back arrow.
export default function DonateLayout() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.card },
        headerTintColor: brand.primary,
        headerTitleStyle: { fontFamily: font.semibold, color: brand.primary },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: brand.background },
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: t('m_give'),
          // A history button at the top right of the Give screen
          headerRight: () => (
            <Pressable onPress={() => router.push('/donate/history')} hitSlop={12}>
              <MaterialIcons name="history" size={26} color={brand.primary} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="history" options={{ title: t('m_my_donations') }} />
    </Stack>
  );
}
