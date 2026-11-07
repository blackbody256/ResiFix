import { createContext } from 'react';
import type { SessionUser } from '../lib/session';

export interface AuthValue {
  user: SessionUser | null;
  signIn: (result: { token: string; user: SessionUser }) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);
