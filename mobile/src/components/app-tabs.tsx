import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { brand } from '@/constants/brand';

// The bottom bar. Each tab has its OWN icon: `md` is a Material Symbol name (Android),
// `sf` is the matching Apple SF Symbol (iPhone). The tab name must match the file or folder in src/app/(app)/.
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={brand.card}
      tintColor={brand.primary}
      indicatorColor={brand.accentSoft}
      labelStyle={{ selected: { color: brand.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="notifications">
        <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell.fill" md="notifications" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
