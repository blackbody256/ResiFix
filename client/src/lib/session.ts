// JWT + current user in localStorage. Only this module touches auth storage.
export type Role = 'RESIDENT' | 'CUSTODIAN' | 'ADMIN';

export interface SessionUser {
  id: string;
  propertyId: string;
  phone: string;
  name: string;
  role: Role;
}

const TOKEN_KEY = 'resifix.token';
const USER_KEY = 'resifix.user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const session = {
  get token() {
    return read(TOKEN_KEY);
  },
  get user(): SessionUser | null {
    try {
      return JSON.parse(read(USER_KEY) ?? 'null') as SessionUser | null;
    } catch {
      return null;
    }
  },
  save({ token, user }: { token: string; user: SessionUser }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // storage unavailable: nothing to clear
    }
  },
};

export const LOGOUT_EVENT = 'resifix:logout';
