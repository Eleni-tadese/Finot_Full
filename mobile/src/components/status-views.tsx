import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

// The small pieces every data screen needs: a spinner, an error with Try again, and "nothing here".

export function LoadingView({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#1e3a8a" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Could not load</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  muted: { fontSize: 15, color: '#475569', textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#b91c1c' },
  button: { marginTop: 8, backgroundColor: '#1e3a8a', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
