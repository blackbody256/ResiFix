// App shell (PWA): top bar with the notification bell and account avatar, page content, and a
// bottom tab bar on every screen size, as in the Group J design.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { features } from '../features';
import { api } from '../lib/api';
import { cx } from '../lib/cx';
import { BellIcon, HomeIcon, UserIcon } from './icons';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Unread count for the bell; refreshed on every navigation and when the tab regains focus. */
function useUnread() {
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

export function Layout() {
  const { user } = useAuth();
  const unread = useUnread();
  if (!user) return null;

  const tabs = [
    { path: '/', label: 'Home', icon: HomeIcon, end: true },
    ...features
      .filter((f) => f.nav && f.icon && (!f.roles || f.roles.includes(user.role)))
      .map((f) => ({ path: f.path, label: f.label, icon: f.icon!, end: false })),
    { path: '/account', label: 'Account', icon: UserIcon, end: false },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-surface/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="text-lg font-extrabold tracking-tight text-primary">
            ResiFix
          </Link>
          <Link
            to="/notifications"
            className="relative ml-auto grid h-10 w-10 place-items-center rounded-full text-on-surface hover:bg-surface-variant"
            aria-label={unread ? `Updates, ${unread} unread` : 'Updates'}
          >
            <BellIcon size={22} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-tertiary px-1 text-[10px] font-bold text-on-tertiary">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <Link
            to="/account"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary"
            aria-label="Account"
          >
            {initials(user.name)}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/60 bg-surface pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <ul className="mx-auto flex max-w-2xl">
          {tabs.map(({ path, label, icon: Icon, end }) => (
            <li key={path} className="flex-1">
              <NavLink
                to={path}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex flex-col items-center gap-0.5 py-2 text-xs font-semibold',
                    isActive ? 'text-primary' : 'text-on-surface-variant hover:text-primary',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cx(
                        'grid h-8 w-14 place-items-center rounded-full transition-colors',
                        isActive && 'bg-primary-container',
                      )}
                    >
                      <Icon size={22} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
