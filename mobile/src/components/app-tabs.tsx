import { MaterialIcons } from '@expo/vector-icons';
import { NativeTabs } from 'expo-router/native-tabs';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { useLayout } from '@/hooks/use-layout';
import { isStaff } from '@/lib/roles';
import { useSession } from '@/lib/session';
import { useTranslation } from 'react-i18next';

// The main navigation. A phone gets the bottom bar; a tablet gets a bar down the LEFT side (a "rail"), because a bottom
// bar stretched across a wide screen is far from the thumbs and wastes the space. Which one is chosen by the SHORT side of
// the screen (see useLayout), so turning the device never swaps the navigator and never loses where you were.
export default function AppTabs() {
  const { tablet } = useLayout();
  return tablet ? <RailTabs /> : <PhoneTabs />;
}

// ---- Phone: the native bottom bar. Each tab has its OWN icon: `md` is a Material Symbol name (Android),
// `sf` is the matching Apple SF Symbol (iPhone). The tab name must match the file or folder in src/app/(app)/.
function PhoneTabs() {
  const { t } = useTranslation();
  const { user } = useSession();
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

      {/* Manage: `hidden` takes the tab out of the bar, so students never see it. */}
      <NativeTabs.Trigger name="manage" hidden={!isStaff(user)}>
        <NativeTabs.Trigger.Label>{t('mng_tab')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wrench.and.screwdriver.fill" md="admin_panel_settings" />
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

// ---- Tablet: the same tabs as a column on the left. `href` is the route each button opens.
type RailItem = {
  name: string;
  href: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  staffOnly?: boolean;
};

const RAIL: RailItem[] = [
  { name: 'index', href: '/', label: 'm_home', icon: 'home' },
  { name: 'events', href: '/events', label: 'tab_events', icon: 'calendar-month' },
  { name: 'courses', href: '/courses', label: 'adm_nav_courses', icon: 'school' },
  { name: 'manage', href: '/manage', label: 'mng_tab', icon: 'admin-panel-settings', staffOnly: true },
  { name: 'notifications', href: '/notifications', label: 'm_alerts', icon: 'notifications' },
  { name: 'profile', href: '/profile', label: 'profile', icon: 'person' },
];

function RailTabs() {
  const { t } = useTranslation();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  // Like the phone's `hidden`: a tab that is not rendered is not in the rail, so students never see Manage.
  const items = RAIL.filter((item) => !item.staffOnly || isStaff(user));

  return (
    <Tabs style={styles.root}>
      <TabList style={[styles.rail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        {items.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href as never} asChild>
            <RailButton icon={item.icon} label={t(item.label)} />
          </TabTrigger>
        ))}
      </TabList>
      <View style={styles.content}>
        <TabSlot style={styles.slot} />
      </View>
    </Tabs>
  );
}

// One button of the rail: an icon over a short label; the open one sits on a soft amber pill like the phone's bar.
function RailButton({
  icon,
  label,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: keyof typeof MaterialIcons.glyphMap; label: string }) {
  return (
    <Pressable {...(props as object)} accessibilityLabel={label} style={styles.button}>
      <View style={[styles.pill, isFocused && styles.pillActive]}>
        <MaterialIcons name={icon} size={26} color={brand.primary} />
      </View>
      <AppText variant="caption" color={isFocused ? brand.primary : brand.muted} style={isFocused ? styles.labelActive : undefined} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: brand.background },
  rail: {
    width: 92,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    backgroundColor: brand.card,
    borderRightWidth: 1,
    borderRightColor: brand.border,
  },
  content: { flex: 1 },
  slot: { flex: 1 },
  button: { alignItems: 'center', gap: 4, width: 84 },
  pill: { width: 56, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: brand.accentSoft },
  labelActive: { fontWeight: '700' },
});
