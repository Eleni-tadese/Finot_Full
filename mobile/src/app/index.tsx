import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// A screen is just a function that returns what to draw.
// <View> is like a <div>, <Text> is like a <p>, <Pressable> is like a <button>.
export default function HomeScreen() {
  // useState works exactly like on the website: the screen redraws when `taps` changes.
  const [taps, setTaps] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Finot</Text>
        <Text style={styles.subtitle}>Gibi Gubae fellowship</Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => setTaps(taps + 1)}>
          <Text style={styles.buttonText}>Tapped {taps} times</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// There is no CSS file. Styles are plain objects. Every <View> is a flexbox column by default.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1, // take all the space available
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    alignItems: 'center', // centre sideways
    justifyContent: 'center', // centre up and down
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  subtitle: {
    fontSize: 18,
    color: '#475569',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#1e3a8a',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
