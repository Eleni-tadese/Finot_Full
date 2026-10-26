import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconBadge } from '@/components/ui/icon-badge';
import { brand } from '@/constants/brand';
import { sectionsFor, staffRoles } from '@/lib/roles';
import { useSession } from '@/lib/session';
import { useTranslation } from 'react-i18next';

// Manage home (step R1): only lists the tools this person's roles will get.
// The server still decides what each role may really do; hiding things here is only for tidiness.
export default function ManageHome() {
  const { t } = useTranslation();
  const { user } = useSession();
  const router = useRouter();
  const roles = staffRoles(user);
  const sections = sectionsFor(user);

  return (
    <Screen title={t('mng_tab')} subtitle={t('mng_intro')}>
      <AppText variant="bodyStrong">{t('mng_your_roles')}</AppText>
      <View style={styles.roles}>
        {roles.map((role) => (
          <Chip key={role} text={t(`role_${role}`)} tone="blue" />
        ))}
      </View>

      {sections.map((section) => (
        // A card with an `href` opens its tool; the others still say "coming soon".
        <Card key={section.key} style={styles.row} onPress={section.href ? () => router.push(section.href as never) : undefined}>
          <IconBadge name={section.icon} />
          <View style={styles.rowText}>
            <AppText variant="bodyStrong">{t(section.label)}</AppText>
            {section.href ? null : (
              <AppText variant="caption" color={brand.muted}>
                {t('mng_soon')}
              </AppText>
            )}
          </View>
          {section.href ? <MaterialIcons name="chevron-right" size={24} color={brand.muted} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1 },
});
