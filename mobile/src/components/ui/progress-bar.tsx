import { StyleSheet, View } from 'react-native';

import { brand } from '@/constants/brand';

// A horizontal bar showing how far something is, from 0 to 100.
// The colour tells the story at a glance: green is good, amber is a warning, red is low.
export function ProgressBar({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  const color = value >= 75 ? brand.success : value >= 50 ? brand.warning : brand.danger;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${value}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: '#e8edf5', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
