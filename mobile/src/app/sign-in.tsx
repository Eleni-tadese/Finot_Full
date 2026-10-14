import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { brand, font } from '@/constants/brand';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTranslation } from 'react-i18next';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();

  // One piece of state per input box, one for the error, one for "waiting for the server".
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    // Same idea as the website: check the boxes first, show the message under the form.
    if (!email.includes('@')) {
      setError(t('m_valid_email'));
      return;
    }
    if (password.length === 0) {
      setError(t('login_password_required'));
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Nothing else to do: the session changed, so the router opens the app by itself.
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError(t('m_wrong_credentials'));
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t('m_something_wrong'));
      }
    } finally {
      setSubmitting(false); // always runs, success or failure
    }
  }

  return (
    <View style={styles.root}>
      {/* The blue brand panel at the top, with the amber line like the website */}
      <SafeAreaView style={styles.brandPanel} edges={['top', 'left', 'right']}>
        <Image source={require('@/assets/images/finot-logo.png')} style={styles.logo} contentFit="contain" />
        <AppText variant="display" color="#ffffff">
          Finot
        </AppText>
        <AppText color={brand.accent}>{t('m_gibi_gubae')}</AppText>
      </SafeAreaView>
      <View style={styles.amberLine} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <AppText variant="title">{t('welcome_back_simple')}</AppText>
          <AppText color={brand.muted} style={styles.lead}>
            {t('m_signin_lead')}
          </AppText>

          <View style={styles.inputWrap}>
            <MaterialIcons name="mail-outline" size={20} color={brand.muted} />
            <TextInput
              style={styles.input}
              placeholder={t('email')}
              placeholderTextColor={brand.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!submitting}
            />
          </View>

          <View style={styles.inputWrap}>
            <MaterialIcons name="lock-outline" size={20} color={brand.muted} />
            <TextInput
              style={styles.input}
              placeholder={t('password')}
              placeholderTextColor={brand.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!submitting}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
              <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={brand.muted} />
            </Pressable>
          </View>

          {error !== '' && (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={brand.danger} />
              <AppText variant="caption" color={brand.danger} style={styles.errorText}>
                {error}
              </AppText>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
            onPress={handleSignIn}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <AppText variant="heading" color="#ffffff">
                {t('sign_in')}
              </AppText>
            )}
          </Pressable>

          {submitting && (
            <AppText variant="caption" color={brand.muted} style={styles.hint}>
              {t('m_signing_in')}
            </AppText>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  flex: { flex: 1 },
  brandPanel: {
    backgroundColor: brand.primary,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 28,
    gap: 4,
  },
  amberLine: { height: 4, backgroundColor: brand.accent },
  logo: { width: 84, height: 84, borderRadius: 20, backgroundColor: '#ffffff', marginBottom: 8 },
  form: { padding: 24, gap: 14 },
  lead: { marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: brand.card,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, fontFamily: font.regular, color: brand.text },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: brand.dangerSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1 },
  button: { backgroundColor: brand.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  buttonPressed: { opacity: 0.7 },
  hint: { textAlign: 'center' },
});
