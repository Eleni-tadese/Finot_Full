import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { brand } from '@/constants/brand';

type IconName = keyof typeof MaterialIcons.glyphMap;

type IconBadgeProps = {
  name: IconName;
  color?: string;
  background?: string;
  size?: number; // the size of the round badge
};

// An icon inside a soft round background, used in tiles and list rows.
export function IconBadge({ name, color = brand.primary, background = brand.primarySoft, size = 44 }: IconBadgeProps) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <MaterialIcons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
