import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function SignInScreen() {
  const { signIn } = useSession();

  // One piece of state per input box, one for the error, one for "waiting for the server".
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
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
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Nothing else to do: the session changed, so the router opens the app by itself.
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Wrong email or password.');
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false); // always runs, success or failure
    }
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
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!submitting}
          />

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (pressed || submitting) && styles.buttonPressed,
            ]}
            onPress={handleSignIn}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          {submitting && (
            <Text style={styles.hint}>Signing in... the first time can take up to a minute.</Text>
          )}
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
  hint: { color: '#475569', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#1e3a8a', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
