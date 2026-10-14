import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '@/lib/types';

// SecureStore keeps small texts encrypted on the phone (Android Keystore). It survives closing the app.
// It is NOT the same as the website's localStorage: nobody can read it without the phone being unlocked.
const ACCESS_KEY = 'finot_access_token';
const REFRESH_KEY = 'finot_refresh_token';

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.access);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh);
}

// Returns null when nothing is saved (first run, or after sign out).
export async function loadTokens(): Promise<TokenPair | null> {
  const access = await SecureStore.getItemAsync(ACCESS_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!access || !refresh) {
    return null;
  }
  return { access, refresh };
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
