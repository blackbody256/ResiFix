// fetch wrapper: JSON in/out, attaches the JWT, normalises errors.
//   const { tickets } = await api.get('/tickets');
//   await api.post('/auth/verify-otp', { phone, code });
import { session } from './session.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline. Check your connection.');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && session.token) {
      session.clear();
      window.dispatchEvent(new Event('resifix:logout'));
    }
    throw new ApiError(
      res.status,
      err.code ?? 'HTTP_ERROR',
      err.message ?? res.statusText,
      err.details,
    );
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
