// Shared by the student shell (Layout) and the staff shell (ConsoleLayout).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from './api';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Unread count for the bell; refreshed on every navigation and when the tab regains focus. */
export function useUnread() {
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<{ unread?: number }>('/notifications')
        .then((r) => !cancelled && setUnread(r.unread ?? 0))
        .catch(() => undefined);
    void load();
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
    };
  }, [pathname]);
  return unread;
}
