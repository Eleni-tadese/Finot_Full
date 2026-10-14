import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';
import { LANGUAGES, type LanguageCode } from '@/i18n';
import { saveLanguage } from '@/lib/storage';

// Three small buttons: English | አማርኛ | Afaan Oromoo. `onDark` is for use on top of the blue photo.
export function LanguagePicker({ onDark = false }: { onDark?: boolean }) {
  const { i18n } = useTranslation();

  function choose(code: LanguageCode) {
    i18n.changeLanguage(code);
    saveLanguage(code); // remember it for the next time the app opens
  }

  return (
    <View style={[styles.row, onDark && styles.rowDark]}>
      {LANGUAGES.map((language) => {
        const active = i18n.language === language.code;
        return (
          <Pressable
            key={language.code}
            onPress={() => choose(language.code)}
            style={[styles.item, active && (onDark ? styles.itemActiveDark : styles.itemActive)]}>
            <AppText
              variant="bodyStrong"
              color={active ? (onDark ? brand.primary : '#ffffff') : onDark ? '#ffffff' : brand.primary}
              style={styles.text}>
              {language.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: brand.primarySoft,
    borderRadius: 999,
    padding: 3,
    alignSelf: 'flex-start',
  },
  rowDark: { backgroundColor: 'rgba(255,255,255,0.18)' },
  item: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  itemActive: { backgroundColor: brand.primary },
  itemActiveDark: { backgroundColor: brand.accent },
  text: { fontSize: 13 },
});
