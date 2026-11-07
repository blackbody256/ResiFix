// fetch wrapper: JSON in/out, attaches the JWT, normalises errors to ApiError.
//   const { tickets } = await api.get<{ tickets: Ticket[] }>('/tickets');
//   await api.post('/auth/verify-otp', { phone, code });
//   await api.upload(`/reporting/tickets/${id}/photos`, formData);
import { LOGOUT_EVENT, session } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const token = session.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'You appear to be offline. Check your connection.');
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    if (res.status === 401 && token) {
      session.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
    }
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};
