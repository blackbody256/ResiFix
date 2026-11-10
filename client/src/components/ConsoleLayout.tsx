// OWNER: Andrew. App shell for custodians and admins, following the Group J warden pages:
// cream sidebar with the operations console menu and the signed-in user, cream top bar with
// breadcrumb, connection status, bell and user, lime page. Phones get a top bar and tab bar.
// Residents keep the student shell in Layout.tsx.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { cx } from '../lib/cx';
import { initials, useUnread } from '../lib/shell';
import { useApi } from '../lib/useApi';
import { CalendarCheckIcon, ClipboardIcon, GridIcon } from './console-icons';
import { BellIcon, BuildingIcon, HomeIcon, LogOutIcon, UserIcon, WrenchIcon } from './icons';

interface NavItem {
  path: string;
  label: string;
  /** Shorter label for the phone tab bar. */
  short: string;
  icon: typeof GridIcon;
  end?: boolean;
  adminOnly?: boolean;
  /** Also highlighted on these paths. */
  also?: string[];
}

const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', short: 'Home', icon: GridIcon, end: true },
  { path: '/custodian', label: 'Complaints / Work Queue', short: 'Queue', icon: ClipboardIcon },
  {
    path: '/visits',
    label: 'Repair Progress & Scheduling',
    short: 'Visits',
    icon: CalendarCheckIcon,
  },
  {
    path: '/properties',
    label: 'Property',
    short: 'Property',
    icon: BuildingIcon,
    adminOnly: true,
  },
  {
    path: '/notifications',
    label: 'Notifications & Account',
    short: 'Updates',
    icon: BellIcon,
    also: ['/account'],
  },
];

const PAGE_TITLE: [string, string][] = [
  ['/custodian', 'Complaints / Work Queue'],
  ['/visits', 'Repair Progress & Scheduling'],
  ['/notifications', 'Notifications'],
  ['/account', 'Account'],
  ['/tickets', 'Ticket'],
  ['/properties', 'Property'],
];

const ROLE_LABEL: Record<string, string> = { CUSTODIAN: 'Custodian', ADMIN: 'Hall administrator' };

/** The device's connection, for the status pill: the PWA must say when actions cannot be sent. */
function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ConsoleLayout() {
  const { user, signOut } = useAuth();
  const unread = useUnread();
  const online = useOnline();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const property = useApi<{ property: { name: string } }>('/properties/mine');
  if (!user) return null;

  const items = NAV.filter((n) => !n.adminOnly || user.role === 'ADMIN');
  const page =
    pathname === '/'
      ? 'Dashboard'
      : (PAGE_TITLE.find(([p]) => pathname.startsWith(p))?.[1] ?? 'ResiFix');
  const role = ROLE_LABEL[user.role] ?? user.role;
  const propertyName = property.data?.property.name ?? '';
  const isActive = (n: NavItem) =>
    n.end
      ? pathname === n.path
      : pathname.startsWith(n.path) || Boolean(n.also?.some((a) => pathname.startsWith(a)));

  const bell = (
    <Link
      to="/notifications"
      className="relative grid h-10 w-10 place-items-center rounded-full text-console-nav hover:bg-surface-variant"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <BellIcon size={20} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-tertiary px-1 text-[10px] font-bold text-on-tertiary">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
  const avatar = (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-outline-variant bg-console-card text-primary">
      <UserIcon size={18} />
      <span
        className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-success"
        aria-hidden
      />
    </span>
  );

  return (
    <div className="min-h-dvh bg-secondary-container lg:pl-64">
      {/* Laptop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-outline-variant/50 bg-surface lg:flex">
        <Link to="/" className="flex items-center gap-3 px-4 pt-5 pb-4">
          <span className="grid h-10 w-10 place-items-center rounded-console bg-primary text-on-primary">
            <WrenchIcon size={20} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-lg leading-tight font-extrabold text-console-ink">ResiFix</span>
              <span className="rounded-full bg-primary-container px-1.5 text-[10px] font-bold text-on-primary-container">
                UG
              </span>
            </span>
            <span className="block truncate text-xs text-console-faint">
              Estates operations{propertyName && ` · ${propertyName}`}
            </span>
          </span>
        </Link>
        <p className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-wider text-console-muted uppercase">
          Operations console
        </p>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {items.map((n) => {
            const active = isActive(n);
            return (
              <NavLink
                key={n.path}
                to={n.path}
                end={n.end}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-3 rounded-console px-3 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-primary text-on-primary'
                    : 'text-console-nav hover:bg-surface-variant/70',
                )}
              >
                <n.icon size={18} />
                <span className="flex-1">{n.label}</span>
                {n.path === '/notifications' && unread > 0 && (
                  <span className="rounded-full bg-tertiary px-2 text-xs font-bold text-on-tertiary">
                    {unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="m-3 rounded-console bg-console-card p-3 shadow-sm">
          <div className="flex items-start gap-3">
            <Link
              to="/account"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-console bg-surface text-console-nav"
              aria-label="Account"
            >
              <BuildingIcon size={18} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-bold text-console-ink">{user.name}</p>
              <p className="truncate text-xs text-console-faint">{propertyName || role}</p>
            </div>
            <span className="rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-bold text-on-primary-container">
              On duty
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-console-faint">Signed in as {role.toLowerCase()}</span>
            <button
              type="button"
              onClick={() => {
                signOut();
                navigate('/login');
              }}
              className="flex items-center gap-1 font-semibold text-error"
            >
              <LogOutIcon size={14} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-outline-variant/50 bg-surface">
        {/* Phone top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 lg:hidden">
          <Link to="/" className="text-lg font-extrabold tracking-tight text-primary">
            ResiFix
          </Link>
          <span
            className={cx('h-2 w-2 rounded-full', online ? 'bg-success' : 'bg-tertiary')}
            title={online ? 'Online' : 'Offline'}
            aria-label={online ? 'Online' : 'Offline'}
          />
          <span className="ml-auto">{bell}</span>
          <Link
            to="/account"
            aria-label="Account"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary"
          >
            {initials(user.name)}
          </Link>
        </div>
        {/* Laptop top bar */}
        <div className="hidden items-center gap-3 px-5 py-2.5 lg:flex">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <BuildingIcon size={16} className="shrink-0 text-console-faint" />
            <span className="text-console-faint">Estates operations</span>
            <span className="text-console-faint">/</span>
            <span className="truncate font-bold text-console-ink">{page}</span>
          </nav>
          {propertyName && (
            <span className="ml-2 flex items-center gap-2 rounded-console border border-outline-variant/70 bg-console-card px-3 py-1.5 text-sm font-semibold text-console-ink">
              <BuildingIcon size={15} className="text-primary" />
              {propertyName}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 rounded-full bg-console-card px-3 py-1 text-xs font-semibold text-console-nav">
            <span
              className={cx('h-2 w-2 rounded-full', online ? 'bg-success' : 'bg-tertiary')}
              aria-hidden
            />
            {online ? 'Online' : 'Offline: changes will not be sent'}
          </span>
          {bell}
          <Link
            to="/account"
            className="flex items-center gap-2.5 rounded-console py-1 pr-2 pl-1 hover:bg-surface-variant/70"
          >
            {avatar}
            <span className="text-left">
              <span className="block text-sm leading-tight font-bold text-console-ink">
                {user.name}
              </span>
              <span className="text-xs text-console-faint">{role}</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="w-full px-4 pt-4 pb-28 lg:px-5 lg:pt-5 lg:pb-8">
        <Outlet />
      </main>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/60 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Main"
      >
        <ul className="flex">
          {items.map((n) => {
            const active = isActive(n);
            const Icon = n.path === '/' ? HomeIcon : n.icon;
            return (
              <li key={n.path} className="flex-1">
                <NavLink
                  to={n.path}
                  end={n.end}
                  className={cx(
                    'flex flex-col items-center gap-0.5 py-2 text-xs font-semibold',
                    active ? 'text-primary' : 'text-console-nav',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-8 w-12 place-items-center rounded-console transition-colors',
                      active && 'bg-primary-container',
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  {n.short}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
