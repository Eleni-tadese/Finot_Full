import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { clearTokens, loadTokens, saveTokens } from '@/lib/storage';
import type { TokenPair, User } from '@/lib/types';

// "Session" = who is signed in, and the keys that prove it.
// The keys are also saved on the phone (storage.ts) so the user stays signed in after closing the app.
type SessionValue = {
  user: User | null;
  accessToken: string | null;
  isSignedIn: boolean;
  // true while the app is still checking the saved keys at start-up
  isLoading: boolean;
  // Throws an ApiError when the server says no (wrong password, server down...).
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

// A context is a box that any screen can read from, without passing props down screen by screen.
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<TokenPair | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Runs once, when the app opens: is there a saved session we can continue?
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const saved = await loadTokens();
        if (!saved) {
          return; // first run or signed out: show the sign-in screen
        }

        let current = saved;
        let me: User;
        try {
          me = await apiRequest<User>('/auth/users/me/', { token: current.access });
        } catch (e) {
          // The access key is short-lived. A 401 means "expired": use the refresh key to get a new one.
          if (!(e instanceof ApiError) || e.status !== 401) {
            throw e;
          }
          const refreshed = await apiRequest<{ access: string }>('/auth/jwt/refresh/', {
            method: 'POST',
            body: { refresh: saved.refresh },
          });
          current = { access: refreshed.access, refresh: saved.refresh };
          me = await apiRequest<User>('/auth/users/me/', { token: current.access });
          await saveTokens(current);
        }

        if (!cancelled) {
          setTokens(current);
          setUser(me);
        }
      } catch (e) {
        // The refresh key is dead too: forget everything. For a network problem we keep the saved
        // keys, so the next app start can try again, and the user just sees the sign-in screen.
        if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
          await clearTokens();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(email: string, password: string) {
    // 1. Ask for the keys. This backend wants the email in a field called "username".
    const newTokens = await apiRequest<TokenPair>('/auth/jwt/create/', {
      method: 'POST',
      body: { username: email, password },
    });

    // 2. Use the access key to ask who we are (roles, name...).
    const me = await apiRequest<User>('/auth/users/me/', { token: newTokens.access });

    // 3. Save the keys on the phone, then remember them in memory.
    await saveTokens(newTokens);
    setTokens(newTokens);
    setUser(me);
  }

  function signOut() {
    setTokens(null);
    setUser(null);
    clearTokens(); // forget the keys on the phone as well
  }

  const value: SessionValue = {
    user,
    accessToken: tokens?.access ?? null,
    isSignedIn: user !== null && tokens !== null,
    isLoading,
    signIn,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// Screens call this hook to read the session: const { user, signOut } = useSession();
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
