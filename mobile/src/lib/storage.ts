import * as SecureStore from 'expo-secure-store';

import type { MyBadge, TokenPair } from '@/lib/types';

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

// The language the person chose (en, am or om), so it is remembered after the app is closed.
const LANGUAGE_KEY = 'finot_language';

export async function saveLanguage(code: string): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, code);
}

export async function loadLanguage(): Promise<string | null> {
  return SecureStore.getItemAsync(LANGUAGE_KEY);
}

// The attendance badge (a short signed text), kept so My badge works without network.
const BADGE_KEY = 'finot_badge';

export async function saveBadge(badge: MyBadge): Promise<void> {
  await SecureStore.setItemAsync(BADGE_KEY, JSON.stringify(badge));
}

export async function loadBadge(): Promise<MyBadge | null> {
  const raw = await SecureStore.getItemAsync(BADGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MyBadge;
  } catch {
    return null;
  }
}

export async function clearBadge(): Promise<void> {
  await SecureStore.deleteItemAsync(BADGE_KEY);
}
