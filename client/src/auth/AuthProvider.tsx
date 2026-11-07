import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOGOUT_EVENT, session, type SessionUser } from '../lib/session';
import { AuthContext } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => (session.token ? session.user : null));

  const signIn = useCallback((result: { token: string; user: SessionUser }) => {
    session.save(result);
    setUser(result.user);
  }, []);

  const signOut = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  // api.ts fires this when the server rejects the token.
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
