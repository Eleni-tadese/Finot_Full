import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { brand } from '@/constants/brand';
import { useTranslation } from 'react-i18next';

// The bottom bar. Each tab has its OWN icon: `md` is a Material Symbol name (Android),
// `sf` is the matching Apple SF Symbol (iPhone). The tab name must match the file or folder in src/app/(app)/.
export default function AppTabs() {
  const { t } = useTranslation();
  return (
    <NativeTabs
      backgroundColor={brand.card}
      tintColor={brand.primary}
      indicatorColor={brand.accentSoft}
      labelStyle={{ selected: { color: brand.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('m_home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Label>{t('tab_events')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="courses">
        <NativeTabs.Trigger.Label>{t('adm_nav_courses')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book.fill" md="school" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>{t('m_alerts')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell.fill" md="notifications" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
