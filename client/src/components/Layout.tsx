// App shell (PWA): top bar with the notification bell and account avatar, page content, and a
// bottom tab bar on every screen size, as in the Group J design.
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { features } from '../features';
import { cx } from '../lib/cx';
import { initials, useUnread } from '../lib/shell';
import { ConsoleLayout } from './ConsoleLayout';
import { BellIcon, HomeIcon, LogOutIcon, UserIcon, WrenchIcon } from './icons';

const ROLE_LABEL: Record<string, string> = {
  RESIDENT: 'Resident',
  CUSTODIAN: 'Custodian',
  ADMIN: 'Hall administrator',
};

export function Layout() {
  const { user, signOut } = useAuth();
  const unread = useUnread();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!user) return null;
  // Custodians and admins: the operations console shell (ConsoleLayout, OWNER: Andrew).
  if (user.role !== 'RESIDENT') return <ConsoleLayout />;

  const tabs = [
    { path: '/', label: 'Home', icon: HomeIcon, end: true },
    ...features
      .filter((f) => f.nav && f.icon && (!f.roles || f.roles.includes(user.role)))
      .map((f) => ({ path: f.path, label: f.label, icon: f.icon!, end: false })),
    { path: '/account', label: 'Account', icon: UserIcon, end: false },
  ];
  // Laptop sidebar: the tabs plus Updates, in the design's order (Account last).
  const sideItems = [
    ...tabs.slice(0, -1),
    { path: '/notifications', label: 'Updates', icon: BellIcon, end: false },
    tabs[tabs.length - 1],
  ];
  const title =
    [...sideItems]
      .reverse()
      .find((t) => (t.end ? pathname === t.path : pathname.startsWith(t.path)))?.label ?? 'ResiFix';
  const role = ROLE_LABEL[user.role] ?? user.role;

  const bell = (
    <Link
      to="/notifications"
      className="relative grid h-10 w-10 place-items-center rounded-full text-on-surface hover:bg-surface-variant"
      aria-label={unread ? `Updates, ${unread} unread` : 'Updates'}
    >
      <BellIcon size={22} />
      {unread > 0 && (
        <span className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-tertiary px-1 text-[10px] font-bold text-on-tertiary">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
  const avatar = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">
      {initials(user.name)}
    </span>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Laptop: sidebar (Group J desktop pages 22-27). */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-outline-variant/60 bg-surface lg:flex">
        <Link to="/" className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-on-primary">
            <WrenchIcon size={20} />
          </span>
          <span>
            <span className="block text-lg leading-tight font-extrabold text-primary">ResiFix</span>
            <span className="text-xs text-on-surface-variant">
              {user.role === 'RESIDENT' ? 'Hall maintenance' : 'Estates operations'}
            </span>
          </span>
        </Link>
        <p className="px-5 pt-2 pb-2 text-xs font-bold tracking-wide text-on-surface-variant uppercase">
          {user.role === 'RESIDENT' ? 'Student portal' : 'Operations console'}
        </p>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {sideItems.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface hover:bg-surface-variant',
                )
              }
            >
              <Icon size={20} />
              <span className="flex-1">{label}</span>
              {path === '/notifications' && unread > 0 && (
                <span className="rounded-full bg-tertiary px-2 text-xs font-bold text-on-tertiary">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-2xl bg-surface-variant/60 p-3">
          <div className="flex items-center gap-3">
            {avatar}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <p className="text-xs text-on-surface-variant">{role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-error"
          >
            <LogOutIcon size={14} /> Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 bg-surface/95 shadow-sm backdrop-blur">
        {/* Phone top bar */}
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5 lg:hidden">
          <Link to="/" className="text-lg font-extrabold tracking-tight text-primary">
            ResiFix
          </Link>
          <span className="ml-auto">{bell}</span>
          <Link to="/account" aria-label="Account">
            {avatar}
          </Link>
        </div>
        {/* Laptop top bar */}
        <div className="hidden items-center gap-4 px-8 py-3 lg:flex">
          <h1 className="text-lg font-bold">{title}</h1>
          <span className="ml-auto">{bell}</span>
          <Link
            to="/account"
            className="flex items-center gap-3 rounded-full py-1 pr-3 pl-1 hover:bg-surface-variant"
          >
            {avatar}
            <span className="text-left">
              <span className="block text-sm leading-tight font-bold">{user.name}</span>
              <span className="text-xs text-on-surface-variant">{role}</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28 lg:max-w-6xl lg:px-8 lg:pt-6 lg:pb-10">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-outline-variant/60 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
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
