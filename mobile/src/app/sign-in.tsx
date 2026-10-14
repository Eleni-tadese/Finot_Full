import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';

export default function SignInScreen() {
  const { signIn } = useSession();

  // One piece of state per input box.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSignIn() {
    // Same idea as the website: check the boxes first, show the message under the form.
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    if (password.length === 0) {
      setError('Enter your password.');
      return;
    }
    setError('');
    signIn(); // temporary: step 5 will ask the real server
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Finot</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleSignIn}>
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 40, fontWeight: '700', color: '#1e3a8a', textAlign: 'center' },
  subtitle: { fontSize: 18, color: '#475569', textAlign: 'center', marginBottom: 24 },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  error: { color: '#b91c1c', fontSize: 14 },
  button: { backgroundColor: '#1e3a8a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
