import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { brand, shadow } from '@/constants/brand';

type CardProps = {
  children: ReactNode;
  onPress?: () => void; // when given, the whole card is tappable
  style?: StyleProp<ViewStyle>;
};

// A white rounded box with a soft shadow: the building block of every screen.
export function Card({ children, onPress, style }: CardProps) {
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed, style]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: brand.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
