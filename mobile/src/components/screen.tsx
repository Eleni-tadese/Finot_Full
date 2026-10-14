import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = {
  children: ReactNode;
  // Give both to switch on "pull down to refresh".
  onRefresh?: () => void;
  refreshing?: boolean;
};

// The frame every normal screen uses: keeps away from the notch, scrolls, and pads the sides.
// Writing it once here means a screen only contains what is special about it.
export function Screen({ children, onRefresh, refreshing = false }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, gap: 12, flexGrow: 1 },
});
