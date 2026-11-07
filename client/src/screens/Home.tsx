import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Card } from '../components/ui';
import { features } from '../features';
import { currentPushState, enablePush, type PushState } from '../lib/push';

const PUSH_LABEL: Record<PushState, string> = {
  unsupported: 'This browser cannot receive notifications; you will get SMS instead.',
  disabled: 'Push notifications are not configured on the server yet; SMS will be used.',
  denied: 'Notifications are blocked in your browser settings; you will get SMS instead.',
  default: '',
  subscribed: 'Notifications are on for this device.',
};

export function Home() {
  const { user } = useAuth();
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    currentPushState().then(setPush, () => setPush('unsupported'));
  }, []);

  if (!user) return null;
  const links = features.filter((f) => !f.roles || f.roles.includes(user.role));

  return (
    <Card>
      <h1 className="text-xl font-semibold">Hello, {user.name}</h1>
      <p className="text-sm text-slate-500">
        Signed in as {user.role.toLowerCase()} · {user.phone}
      </p>
      <ul className="my-4 list-disc space-y-1 pl-5">
        {links.map((f) => (
          <li key={f.path}>
            <Link to={f.path} className="text-brand-700 underline dark:text-brand-500">
              {f.label}
            </Link>
          </li>
        ))}
      </ul>
      {push === 'default' ? (
        <button
          type="button"
          className="text-sm text-brand-700 underline dark:text-brand-500"
          onClick={() => enablePush().then(setPush, () => setPush('unsupported'))}
        >
          Turn on notifications for this device
        </button>
      ) : (
        push && <p className="text-sm text-slate-500">{PUSH_LABEL[push]}</p>
      )}
    </Card>
  );
}
