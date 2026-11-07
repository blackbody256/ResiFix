import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { features } from '../features';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2 py-1 text-sm ${
    isActive
      ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-500'
      : 'text-slate-600 hover:text-brand-700 dark:text-slate-300'
  }`;

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const visible = features.filter((f) => !f.roles || (user && f.roles.includes(user.role)));

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="font-bold text-brand-700 dark:text-brand-500">
            ResiFix
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            {visible.map((f) => (
              <NavLink key={f.path} to={f.path} className={navClass}>
                {f.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="ml-auto text-sm text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
