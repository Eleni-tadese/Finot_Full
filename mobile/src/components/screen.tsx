import type { ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { brand } from '@/constants/brand';

type ScreenProps = {
  children: ReactNode;
  title?: string; // a big title at the top of the page
  subtitle?: string;
  headerRight?: ReactNode; // for example a link on the right of the title
  // Give both to switch on "pull down to refresh".
  onRefresh?: () => void;
  refreshing?: boolean;
};

// The frame every normal screen uses: keeps away from the notch, scrolls, pads the sides, draws the title.
// Writing it once here means a screen only contains what is special about it.
export function Screen({ children, title, subtitle, headerRight, onRefresh, refreshing = false }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* The app draws edge to edge, so Android no longer shrinks the window for the keyboard: this box does it. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brand.primary]} tintColor={brand.primary} />
            ) : undefined
          }>
          {title ? <PageHeader title={title} subtitle={subtitle} right={headerRight} /> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="display" color={brand.primary}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color={brand.muted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: brand.background },
  // width + maxWidth + alignSelf: on a tablet the content is a centred column, not stretched edge to edge
  content: { padding: 20, gap: 14, flexGrow: 1, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  headerText: { flex: 1, gap: 2 },
});
