// Page side of the offline outbox (lib/outbox.ts): what is waiting, and sending it when the
// connection is back (`online`), when the app opens or comes to the front, or on "Send now".
import { useCallback, useEffect, useState } from 'react';
import {
  discardFromOutbox,
  flushOutbox,
  listOutbox,
  onOutboxMessage,
  OUTBOX_SYNC_TAG,
  type OutboxEntry,
} from './outbox';
import { session } from './session';

export interface SentReport {
  ticketId: string;
  fault: string;
  photoErrors: string[];
}

/** Ask the service worker to send the outbox when the connection returns, even if the app is
 * closed (Background Sync; Chrome/Android). Other browsers rely on the page instead. */
export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sync = (
      reg as
        | (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
        | undefined
    )?.sync;
    await sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    // unsupported or not allowed: the page sends on `online` instead
  }
}

export function useOutbox() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [sent, setSent] = useState<SentReport[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(() => {
    listOutbox().then(setEntries, () => setEntries([]));
  }, []);

  const sendNow = useCallback(async () => {
    const { token, user } = session;
    if (!token || !user || !navigator.onLine) return;
    setSending(true);
    try {
      await flushOutbox({ userId: user.id, token });
    } catch {
      // IndexedDB unavailable: nothing could have been saved either
    } finally {
      setSending(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    // First send on the next tick: try anything left over from last time the app was open.
    const first = window.setTimeout(() => void sendNow(), 0);
    const unsubscribe = onOutboxMessage((m) => {
      if (m.type === 'sent')
        setSent((s) => [
          ...s,
          { ticketId: m.ticketId, fault: m.fault, photoErrors: m.photoErrors },
        ]);
      refresh();
    });
    const goOnline = () => {
      setOnline(true);
      void sendNow();
    };
    const goOffline = () => setOnline(false);
    const visible = () => document.visibilityState === 'visible' && void sendNow();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(first);
      unsubscribe();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, sendNow]);

  return {
    entries,
    sent,
    online,
    sending,
    sendNow,
    discard: (id: string) => discardFromOutbox(id).then(refresh),
    dismissSent: (ticketId: string) => setSent((s) => s.filter((r) => r.ticketId !== ticketId)),
  };
}
