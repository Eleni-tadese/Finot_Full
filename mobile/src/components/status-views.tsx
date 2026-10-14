import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { useTranslation } from 'react-i18next';

// The small pieces every data screen needs: a spinner, an error with Try again, and "nothing here".

export function LoadingView({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={brand.primary} />
      <AppText color={brand.muted} style={styles.text}>
        {label ?? t('loading')}
      </AppText>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: brand.dangerSoft }]}>
        <MaterialIcons name="cloud-off" size={30} color={brand.danger} />
      </View>
      <AppText variant="heading">{t('m_could_not_load')}</AppText>
      <AppText color={brand.muted} style={styles.text}>
        {message}
      </AppText>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <AppText variant="bodyStrong" color="#ffffff">
            {t('m_try_again')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyView({ message, icon = 'inbox' }: { message: string; icon?: keyof typeof MaterialIcons.glyphMap }) {
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: brand.primarySoft }]}>
        <MaterialIcons name={icon} size={30} color={brand.primary} />
      </View>
      <AppText color={brand.muted} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
  button: { marginTop: 8, backgroundColor: brand.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 },
});
