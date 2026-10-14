import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { brand, font } from '@/constants/brand';
import { AppText } from '@/components/ui/app-text';

type AvatarProps = {
  name: string;
  photo?: string | null;
  size?: number;
};

// The person's photo, or their initials on a blue circle when there is no photo.
export function Avatar({ name, photo, size = 64 }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  }

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <AppText color="#ffffff" style={{ fontFamily: font.bold, fontSize: size * 0.38 }}>
        {initials || '?'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
});
