// OWNER: Ayan: PB-023. In-app inbox of ticket updates (the same messages sent by Web Push / SMS).
// Opening an update marks it read and goes to its ticket.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, ErrorText } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Loading } from './FeaturePlaceholder';

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

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Updates</h1>
        {data && data.unread > 0 && (
          <>
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
              {data.unread} new
            </span>
            <button
              type="button"
              onClick={readAll}
              disabled={busy}
              className="ml-auto text-sm text-brand-700 underline disabled:opacity-60 dark:text-brand-500"
            >
              Mark all as read
            </button>
          </>
        )}
      </div>
      {loading && <Loading />}
      <ErrorText>{error?.message ?? actionError}</ErrorText>
      {data && data.notifications.length === 0 && (
        <p className="text-sm text-slate-500">
          No updates yet. We will tell you here when something happens on your tickets.
        </p>
      )}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {data?.notifications.map((n) => {
          const { title, body } = split(n.message);
          const unread = !n.readAt;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className="flex w-full gap-3 py-3 text-left hover:text-brand-700"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-brand-600' : ''}`}
                />
                <span className="min-w-0">
                  <span className={`block ${unread ? 'font-semibold' : ''}`}>
                    {title}
                    {unread && <span className="sr-only"> (new)</span>}
                  </span>
                  {body && <span className="block text-sm">{body}</span>}
                  <span className="block text-xs text-slate-500">{when(n.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
