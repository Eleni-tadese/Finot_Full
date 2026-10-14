import { createContext, useContext, useState, type ReactNode } from 'react';

import { apiRequest } from '@/lib/api';
import type { TokenPair, User } from '@/lib/types';

// "Session" = who is signed in, and the keys that prove it.
// For now it lives only in memory (forgotten when the app closes). Step 6 saves it on the phone.
type SessionValue = {
  user: User | null;
  accessToken: string | null;
  isSignedIn: boolean;
  // Throws an ApiError when the server says no (wrong password, server down...).
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

// A context is a box that any screen can read from, without passing props down screen by screen.
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<TokenPair | null>(null);

  async function signIn(email: string, password: string) {
    // 1. Ask for the keys. This backend wants the email in a field called "username".
    const newTokens = await apiRequest<TokenPair>('/auth/jwt/create/', {
      method: 'POST',
      body: { username: email, password },
    });

    // 2. Use the access key to ask who we are (roles, name...).
    const me = await apiRequest<User>('/auth/users/me/', { token: newTokens.access });

    // 3. Only now are we "signed in": the router sees user change and opens the app.
    setTokens(newTokens);
    setUser(me);
  }

  function signOut() {
    setTokens(null);
    setUser(null);
  }

  const value: SessionValue = {
    user,
    accessToken: tokens?.access ?? null,
    isSignedIn: user !== null && tokens !== null,
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
