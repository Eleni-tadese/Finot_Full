import { createContext, useContext, useState, type ReactNode } from 'react';

// "Session" = is somebody signed in? For now it lives only in memory (it is forgotten when the app closes).
// Step 5 will call the real API; step 6 will save the token on the phone.
type SessionValue = {
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

// A context is a box that any screen can read from, without passing props down screen by screen.
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);

  const value: SessionValue = {
    isSignedIn,
    signIn: () => setIsSignedIn(true),
    signOut: () => setIsSignedIn(false),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// Screens call this hook to read the session: const { isSignedIn, signOut } = useSession();
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return value;
}
