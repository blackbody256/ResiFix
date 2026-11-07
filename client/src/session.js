// Stores the JWT and current user. The only module that touches localStorage for auth.
const TOKEN_KEY = 'resifix.token';
const USER_KEY = 'resifix.user';

function read(key) {
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
  get user() {
    try {
      return JSON.parse(read(USER_KEY));
    } catch {
      return null;
    }
  },
  save({ token, user }) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() {
    return Boolean(this.token);
  },
};
