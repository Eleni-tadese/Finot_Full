import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { brand, font } from '@/constants/brand';
import { ApiError, apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { InitiateDonationResponse, VerifyDonationResponse } from '@/lib/types';

const QUICK_AMOUNTS = [10, 20, 50, 100, 200];

// What the screen is doing: asking for an amount, waiting, or showing the result.
type Phase =
  | { name: 'form' }
  | { name: 'starting' } // asking our server for the Chapa page
  | { name: 'checking'; txRef: string } // back from Chapa, asking if it was paid
  | { name: 'paid'; receipt: VerifyDonationResponse }
  | { name: 'notPaid'; txRef: string; message: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The giving form. A signed-in student gives their weekly donation; a visitor (no account) may add an optional name.
export function GiveForm() {
  const { accessToken, isSignedIn } = useSession();
  const guest = !isSignedIn;
  const router = useRouter();

  const [amountText, setAmountText] = useState('10');
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>({ name: 'form' });

  const amount = Number(amountText);
  const amountValid = Number.isFinite(amount) && amount >= 1;

  // Ask the server if the payment went through. Chapa can take a few seconds, so try up to 3 times.
  async function verify(txRef: string) {
    setPhase({ name: 'checking', txRef });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const receipt = await apiRequest<VerifyDonationResponse>(`/api/donations/verify/${txRef}/`);
        setPhase({ name: 'paid', receipt });
        return;
      } catch (e) {
        // 400 = not paid (yet). Anything else (server down...) also ends in "not confirmed".
        if (attempt < 2) {
          await wait(2500);
          continue;
        }
        const message =
          e instanceof ApiError && e.status === 503
            ? 'We could not reach the payment service. Please check again in a moment.'
            : 'We have not received confirmation of this payment yet. If you paid, it can take a minute.';
        setPhase({ name: 'notPaid', txRef, message });
      }
    }
  }

  async function handleGive() {
    if (!amountValid) {
      setError('Enter an amount of 1 birr or more.');
      return;
    }
    setError('');
    setPhase({ name: 'starting' });

    let started: InitiateDonationResponse;
    try {
      started = await apiRequest<InitiateDonationResponse>('/api/donations/initiate/', {
        method: 'POST',
        body: guest ? { amount, name: guestName.trim() } : { amount },
        token: accessToken,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setPhase({ name: 'form' });
      return;
    }

    // Open Chapa's page inside the app. This line waits until the person closes it.
    await WebBrowser.openBrowserAsync(started.checkout_url);
    await verify(started.tx_ref);
  }

  // ---------- result screens ----------
  if (phase.name === 'paid') {
    return (
      <Screen>
        <View style={styles.resultBox}>
          <View style={[styles.resultIcon, { backgroundColor: brand.successSoft }]}>
            <MaterialIcons name="check-circle" size={52} color={brand.success} />
          </View>
          <AppText variant="display" style={styles.center}>
            Thank you!
          </AppText>
          <AppText color={brand.muted} style={styles.center}>
            Your donation of {phase.receipt.amount} {phase.receipt.currency} was received.
          </AppText>
          <Card style={styles.receipt}>
            <AppText variant="label" color={brand.muted}>
              Reference
            </AppText>
            <AppText variant="bodyStrong">{phase.receipt.tx_ref}</AppText>
          </Card>
          {!guest && (
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/donate/history')}>
              <AppText variant="heading" color="#ffffff">
                See my donations
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()}>
            <AppText variant="bodyStrong" color={brand.primary}>
              Done
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (phase.name === 'notPaid') {
    return (
      <Screen>
        <View style={styles.resultBox}>
          <View style={[styles.resultIcon, { backgroundColor: brand.warningSoft }]}>
            <MaterialIcons name="hourglass-top" size={48} color={brand.warning} />
          </View>
          <AppText variant="title" style={styles.center}>
            Payment not confirmed yet
          </AppText>
          <AppText color={brand.muted} style={styles.center}>
            {phase.message}
          </AppText>
          <Pressable style={styles.primaryButton} onPress={() => verify(phase.txRef)}>
            <AppText variant="heading" color="#ffffff">
              Check again
            </AppText>
          </Pressable>
          <Pressable onPress={() => setPhase({ name: 'form' })}>
            <AppText variant="bodyStrong" color={brand.primary}>
              Start a new donation
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (phase.name === 'starting' || phase.name === 'checking') {
    return (
      <Screen>
        <View style={styles.resultBox}>
          <ActivityIndicator size="large" color={brand.primary} />
          <AppText variant="heading" style={styles.center}>
            {phase.name === 'starting' ? 'Opening the payment page...' : 'Checking your payment...'}
          </AppText>
          <AppText color={brand.muted} style={styles.center}>
            Please wait. The first request can take up to a minute.
          </AppText>
        </View>
      </Screen>
    );
  }

  // ---------- the form ----------
  return (
    <Screen>
      <Card style={styles.intro}>
        <MaterialIcons name="volunteer-activism" size={30} color={brand.primary} />
        <View style={styles.introText}>
          <AppText variant="heading">{guest ? 'Support the fellowship' : 'Weekly donation'}</AppText>
          <AppText variant="caption" color={brand.muted}>
            {guest
              ? 'No account is needed. Adding your name is optional.'
              : 'Your gift supports the fellowship. It is recorded on your account.'}
          </AppText>
        </View>
      </Card>

      <AppText variant="label" color={brand.muted}>
        Choose an amount (birr)
      </AppText>
      <View style={styles.chips}>
        {QUICK_AMOUNTS.map((value) => {
          const active = amountText === String(value);
          return (
            <Pressable
              key={value}
              onPress={() => setAmountText(String(value))}
              style={[styles.amountChip, active && styles.amountChipActive]}>
              <AppText variant="bodyStrong" color={active ? '#ffffff' : brand.primary}>
                {value}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.inputWrap}>
        <AppText variant="heading" color={brand.muted}>
          ETB
        </AppText>
        <TextInput
          style={styles.input}
          value={amountText}
          onChangeText={(text) => setAmountText(text.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="Other amount"
          placeholderTextColor={brand.muted}
        />
      </View>

      {guest && (
        <View style={styles.inputWrap}>
          <MaterialIcons name="person-outline" size={20} color={brand.muted} />
          <TextInput
            style={styles.nameInput}
            value={guestName}
            onChangeText={setGuestName}
            placeholder="Your name (optional)"
            placeholderTextColor={brand.muted}
          />
        </View>
      )}

      {error !== '' && (
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={18} color={brand.danger} />
          <AppText variant="caption" color={brand.danger} style={styles.errorText}>
            {error}
          </AppText>
        </View>
      )}

      <Pressable
        style={[styles.primaryButton, !amountValid && styles.disabled]}
        onPress={handleGive}
        disabled={!amountValid}>
        <MaterialIcons name="lock" size={18} color="#ffffff" />
        <AppText variant="heading" color="#ffffff">
          Give {amountValid ? `${amount} birr` : ''}
        </AppText>
      </Pressable>

      <AppText variant="caption" color={brand.muted} style={styles.center}>
        You will pay on Chapa&apos;s secure page. Finot never sees your card or mobile-money details.
      </AppText>

      {!guest && (
        <Pressable onPress={() => router.push('/donate/history')} style={styles.historyLink}>
          <MaterialIcons name="history" size={18} color={brand.primary} />
          <AppText variant="bodyStrong" color={brand.primary}>
            My donations
          </AppText>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  introText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  amountChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: brand.card,
    borderWidth: 1,
    borderColor: brand.border,
  },
  amountChipActive: { backgroundColor: brand.primary, borderColor: brand.primary },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: brand.card,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 22, fontFamily: font.bold, color: brand.text },
  nameInput: { flex: 1, paddingVertical: 14, fontSize: 16, fontFamily: font.regular, color: brand.text },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: brand.dangerSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignSelf: 'stretch',
  },
  disabled: { opacity: 0.4 },
  historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  resultBox: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  resultIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  receipt: { alignSelf: 'stretch', gap: 2 },
});
