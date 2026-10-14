import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';

type Tone = 'blue' | 'green' | 'red' | 'grey' | 'amber';

const tones: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: brand.primarySoft, fg: brand.primary },
  green: { bg: brand.successSoft, fg: brand.success },
  red: { bg: brand.dangerSoft, fg: brand.danger },
  grey: { bg: '#eef2f7', fg: '#475569' },
  amber: { bg: brand.warningSoft, fg: brand.warning },
};

// A small coloured label ("Upcoming", "Present"...).
export function Chip({ text, tone = 'grey' }: { text: string; tone?: Tone }) {
  return (
    <View style={[styles.chip, { backgroundColor: tones[tone].bg }]}>
      <AppText variant="caption" color={tones[tone].fg} style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontWeight: '600' },
});
