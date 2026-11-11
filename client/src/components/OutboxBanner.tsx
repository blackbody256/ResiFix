// PB-005 offline (PWA shell): shown at the top of every screen. Tells the resident they are
// offline, lists reports saved on this phone and waiting to send, and confirms when one is sent.
import { Link } from 'react-router';
import { ago } from '../lib/tickets';
import { useOutbox } from '../lib/useOutbox';
import { AlertIcon, CheckCircleIcon, CloseIcon, CloudOffIcon, SendIcon } from './icons';

export function OutboxBanner() {
  const { entries, sent, online, sending, sendNow, discard, dismissSent } = useOutbox();
  const waiting = entries.filter((e) => !e.error);
  const refused = entries.filter((e) => e.error);
  if (online && !entries.length && !sent.length) return null;

  return (
    <div className="mb-4 space-y-2" aria-live="polite">
      {!online && (
        <div className="flex items-center gap-3 rounded-2xl bg-on-surface px-4 py-3 text-sm text-surface">
          <CloudOffIcon size={18} className="shrink-0" />
          <span>
            You are offline. New reports are saved on this phone and sent when you are back online.
          </span>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="rounded-2xl bg-secondary-container px-4 py-3 text-sm text-on-secondary-container ring-1 ring-secondary/30">
          <div className="flex items-center gap-2">
            <SendIcon size={16} className="shrink-0" />
            <p className="flex-1 font-bold">
              {waiting.length} report{waiting.length > 1 ? 's' : ''} waiting to send
            </p>
            {online && (
              <button
                type="button"
                onClick={() => void sendNow()}
                disabled={sending}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send now'}
              </button>
            )}
          </div>
          <ul className="mt-1 space-y-0.5">
            {waiting.map((e) => (
              <li key={e.id} className="text-xs">
                {e.ticketId
                  ? `${e.photos.length} photo${e.photos.length > 1 ? 's' : ''} for ${e.label.fault}`
                  : `${e.label.fault} · ${e.label.room}`}{' '}
                <span className="opacity-70">
                  · saved {ago(new Date(e.createdAt).toISOString())}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {refused.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-3 rounded-2xl bg-error-container px-4 py-3 text-sm text-on-error-container"
        >
          <AlertIcon size={18} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Your {e.label.fault.toLowerCase()} report could not be sent</p>
            <p>{e.error}</p>
          </div>
          <button
            type="button"
            onClick={() => void discard(e.id)}
            className="shrink-0 text-xs font-semibold underline"
          >
            Discard
          </button>
        </div>
      ))}

      {sent.map((r) => (
        <div
          key={r.ticketId}
          className="flex items-center gap-3 rounded-2xl bg-success-container px-4 py-3 text-sm text-on-success-container"
        >
          <CheckCircleIcon size={18} className="shrink-0" />
          <p className="flex-1">
            Your saved <strong>{r.fault.toLowerCase()}</strong> report was sent
            {r.photoErrors.length > 0 &&
              ` (${r.photoErrors.length} photo could not be added)`}.{' '}
            <Link
              to={`/tickets?focus=${r.ticketId}`}
              onClick={() => dismissSent(r.ticketId)}
              className="font-semibold underline"
            >
              View ticket
            </Link>
          </p>
          <button
            type="button"
            onClick={() => dismissSent(r.ticketId)}
            aria-label="Dismiss"
            className="shrink-0"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
