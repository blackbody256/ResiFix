// OWNER: Ayan: PB-023. In-app inbox of ticket updates (the same messages sent by Web Push / SMS).
// Opening an update marks it read and goes to its ticket.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BellIcon, ChevronRightIcon } from '../components/icons';
import { Card, ErrorText, Spinner } from '../components/ui';
import { cx } from '../lib/cx';
import { api, ApiError } from '../lib/api';
import { when } from '../lib/tickets';
import { useApi } from '../lib/useApi';

interface Notification {
  id: string;
  ticketId: string | null;
  message: string; // "Title: body"
  readAt: string | null;
  createdAt: string;
}
interface InboxResponse {
  notifications: Notification[];
  unread: number;
}

/** Messages are stored as "Title: body"; show the title in bold. */
function split(message: string) {
  const i = message.indexOf(': ');
  return i > 0 ? { title: message.slice(0, i), body: message.slice(i + 2) } : { title: message };
}

export function Notifications() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<InboxResponse>('/notifications');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  const open = (n: Notification) =>
    act(async () => {
      if (!n.readAt) await api.post(`/notifications/${n.id}/read`);
      if (n.ticketId) navigate(`/tickets?focus=${n.ticketId}`);
      else reload();
    });

  const readAll = () =>
    act(async () => {
      setBusy(true);
      try {
        await api.post('/notifications/read-all');
        reload();
      } finally {
        setBusy(false);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">Updates</h1>
        {data && data.unread > 0 && (
          <>
            <span className="rounded-full bg-tertiary px-2.5 py-0.5 text-xs font-bold text-on-tertiary">
              {data.unread} new
            </span>
            <button
              type="button"
              onClick={readAll}
              disabled={busy}
              className="ml-auto text-sm font-semibold text-primary disabled:opacity-60"
            >
              Mark all as read
            </button>
          </>
        )}
      </div>
      {loading && <Spinner />}
      {(error || actionError) && <ErrorText>{error?.message ?? actionError}</ErrorText>}
      {data && data.notifications.length === 0 && (
        <Card className="text-center">
          <BellIcon size={28} className="mx-auto text-primary" />
          <p className="mt-2 font-semibold">No updates yet</p>
          <p className="text-sm text-on-surface-variant">
            We will tell you here when something happens on your tickets.
          </p>
        </Card>
      )}
      <ul className="space-y-2">
        {data?.notifications.map((n) => {
          const { title, body } = split(n.message);
          const unread = !n.readAt;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className={cx(
                  'flex w-full gap-3 rounded-3xl p-4 text-left shadow-sm transition hover:shadow-md',
                  unread ? 'bg-surface ring-2 ring-primary/30' : 'bg-surface/70',
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                    unread ? 'bg-tertiary' : 'bg-outline-variant',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cx('block', unread ? 'font-bold' : 'font-semibold')}>
                    {title}
                    {unread && <span className="sr-only"> (new)</span>}
                  </span>
                  {body && <span className="block text-sm text-on-surface-variant">{body}</span>}
                  <span className="mt-1 block text-xs text-outline">{when(n.createdAt)}</span>
                </span>
                {n.ticketId && (
                  <ChevronRightIcon size={18} className="mt-1 shrink-0 text-outline" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
