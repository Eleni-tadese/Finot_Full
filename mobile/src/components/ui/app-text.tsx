import { StyleSheet, Text, type TextProps } from 'react-native';

import { brand, font } from '@/constants/brand';

// One Text component for the whole app: it applies the Finot font and a set of ready-made sizes.
// Use <AppText variant="title">...</AppText> instead of <Text style={{ fontSize... }}>.
type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
};

export function AppText({ variant = 'body', color = brand.text, style, ...props }: AppTextProps) {
  return <Text {...props} style={[styles[variant], { color }, style]} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
