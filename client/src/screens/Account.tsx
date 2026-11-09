// OWNER: Ayan (PWA shell). Who is signed in, notification settings for this device, sign out.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { BellIcon, LogOutIcon } from '../components/icons';
import { Button, Card, Eyebrow, Notice } from '../components/ui';
import { currentPushState, enablePush, type PushState } from '../lib/push';

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications, so updates come by SMS instead.',
  disabled: 'Push notifications are not set up on the server yet, so updates come by SMS.',
  denied: 'Notifications are blocked in your browser settings, so updates come by SMS.',
  default: 'Get repair updates on this phone as soon as they happen.',
  subscribed: 'Notifications are on for this device.',
};

const ROLE: Record<string, string> = {
  RESIDENT: 'Resident',
  CUSTODIAN: 'Custodian',
  ADMIN: 'Hall administrator',
};

export function Account() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentPushState().then(setPush, () => setPush('unsupported'));
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Account</h1>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <Eyebrow>Signed in as</Eyebrow>
          <p className="mt-1 text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-on-surface-variant">
            {ROLE[user.role] ?? user.role} · {user.phone}
          </p>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <BellIcon size={20} className="text-primary" />
            <h2 className="font-semibold">Notifications</h2>
          </div>
          {push && <p className="mt-2 text-sm text-on-surface-variant">{PUSH_TEXT[push]}</p>}
          {push === 'default' && (
            <Button
              className="mt-4"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                enablePush()
                  .then(setPush, () => setPush('unsupported'))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </Button>
          )}
          {push === 'subscribed' && (
            <Notice tone="success" className="mt-3">
              You will get a notification when your report is reviewed, a visit is booked or the
              repair is done.
            </Notice>
          )}
        </Card>
      </div>

      <Button
        variant="danger"
        className="lg:w-auto lg:px-8"
        onClick={() => {
          signOut();
          navigate('/login');
        }}
      >
        <LogOutIcon size={18} /> Log out
      </Button>
    </div>
  );
}
