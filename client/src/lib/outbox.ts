// Offline fault reports (PB-005, "PWA shell + offline"). OWNER: Ayan
//
// A report made with no signal is saved here (IndexedDB, photos as Blobs) and sent later by
// whichever runs first: the page (on `online`, on app start, "Send now") or the service worker
// (Background Sync, which can fire with the app closed). This file is shared by both, so it only
// uses APIs that exist in a window and a worker: indexedDB, fetch, FormData, BroadcastChannel.
//
// Sending is two steps, and each finished step is saved before the next:
//   1. POST /api/reporting/tickets      -> store the new ticketId on the entry
//   2. POST /api/reporting/tickets/:id/photos for each photo, removing each one once sent
// so a retry after a dropped connection never creates the ticket twice.

export const OUTBOX_SYNC_TAG = 'resifix-outbox';
const CHANNEL = 'resifix-outbox';
const DB = 'resifix';
const STORE = 'outbox';
/** A send that has not finished after this long is treated as abandoned (tab closed). */
const LOCK_MS = 60_000;
export const SIGN_IN_AGAIN = 'Sign in again to send this report.';

export interface OutboxPhoto {
  name: string;
  blob: Blob;
}

export interface OutboxEntry {
  id: string;
  createdAt: number;
  userId: string;
  /** JWT at save time, so the service worker can send without the page. */
  token: string;
  body: { roomId: string; faultItemId: string; description?: string };
  /** For the "waiting to send" list: "Leaking tap", "Block A, Room 101". */
  label: { fault: string; room: string };
  photos: OutboxPhoto[];
  /** Set once step 1 succeeded. */
  ticketId?: string;
  photoErrors: string[];
  sendingAt?: number;
  /** Set when the server refused the report for good (e.g. no longer your room). */
  error?: string;
}

export type OutboxMessage =
  { type: 'changed' } | { type: 'sent'; ticketId: string; fault: string; photoErrors: string[] };

/* ------------------------------------------------------------------ IndexedDB */

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function notify(message: OutboxMessage) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(message);
    ch.close();
  } catch {
    // BroadcastChannel unavailable: open pages still refresh on their own events
  }
}

/** Listen for outbox changes from any tab or the service worker. Returns an unsubscribe. */
export function onOutboxMessage(handler: (message: OutboxMessage) => void): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<OutboxMessage>) => handler(e.data);
    return () => ch.close();
  } catch {
    return () => undefined;
  }
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = (await run<OutboxEntry[]>('readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveToOutbox(
  entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'photoErrors'> & { photoErrors?: string[] },
) {
  const full: OutboxEntry = {
    photoErrors: [],
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await run('readwrite', (s) => s.put(full));
  notify({ type: 'changed' });
  return full;
}

export async function discardFromOutbox(id: string) {
  await run('readwrite', (s) => s.delete(id));
  notify({ type: 'changed' });
}

async function put(entry: OutboxEntry) {
  await run('readwrite', (s) => s.put(entry));
}

/** Take the entry for sending unless someone else is already sending it. */
async function claim(id: string): Promise<OutboxEntry | null> {
  const db = await open();
  try {
    return await new Promise<OutboxEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let claimed: OutboxEntry | null = null;
      const get = store.get(id);
      get.onsuccess = () => {
        const entry = get.result as OutboxEntry | undefined;
        if (!entry || entry.error) return;
        if (entry.sendingAt && Date.now() - entry.sendingAt < LOCK_MS) return;
        claimed = { ...entry, sendingAt: Date.now() };
        store.put(claimed);
      };
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* ----------------------------------------------------------------------- send */

type Outcome = 'ok' | 'retry' | { refused: string };

async function send(path: string, token: string, init: RequestInit): Promise<[Outcome, unknown]> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
  } catch {
    return ['retry', null]; // still offline
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return ['ok', data];
  if (res.status >= 500 || res.status === 408 || res.status === 429) return ['retry', data];
  const message =
    (data as { error?: { message?: string } } | null)?.error?.message ?? `Error ${res.status}`;
  if (res.status === 401) return [{ refused: SIGN_IN_AGAIN }, data];
  return [{ refused: message }, data];
}

/**
 * Send everything waiting. `session` (page only) replaces the saved token for the same user, so
 * a report saved before signing in again still goes through. Stops at the first sign that the
 * network is still down. Returns how many were sent and how many still wait to be sent (not
 * counting reports the server refused, which wait for the resident to discard them).
 */
export async function flushOutbox(session?: {
  userId: string;
  token: string;
}): Promise<{ sent: number; waiting: number }> {
  let sent = 0;
  const waiting = await listOutbox();
  // A report refused only because its saved login expired is retried with the fresh one.
  if (session) {
    for (const e of waiting) {
      if (e.error === SIGN_IN_AGAIN && e.userId === session.userId) {
        await put({ ...e, error: undefined, token: session.token });
      }
    }
  }
  for (const { id } of waiting) {
    const entry = await claim(id);
    if (!entry) continue;
    if (session && session.userId === entry.userId) entry.token = session.token;

    // Step 1: create the ticket (only once).
    if (!entry.ticketId) {
      const [outcome, data] = await send('/reporting/tickets', entry.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      });
      if (outcome === 'retry') {
        await put({ ...entry, sendingAt: undefined });
        break;
      }
      if (outcome !== 'ok') {
        await put({ ...entry, sendingAt: undefined, error: outcome.refused });
        notify({ type: 'changed' });
        continue;
      }
      entry.ticketId = (data as { ticket: { id: string } }).ticket.id;
      await put(entry);
    }

    // Step 2: photos, each removed from the entry once it is on the server.
    let offline = false;
    while (entry.photos.length) {
      const [photo] = entry.photos;
      const form = new FormData();
      form.append('photo', photo.blob, photo.name);
      const [outcome] = await send(`/reporting/tickets/${entry.ticketId}/photos`, entry.token, {
        method: 'POST',
        body: form,
      });
      if (outcome === 'retry') {
        offline = true;
        break;
      }
      if (outcome !== 'ok') entry.photoErrors.push(`${photo.name}: ${outcome.refused}`);
      entry.photos = entry.photos.slice(1);
      await put(entry);
    }
    if (offline) {
      await put({ ...entry, sendingAt: undefined });
      notify({ type: 'changed' });
      break;
    }

    await run('readwrite', (s) => s.delete(entry.id));
    sent += 1;
    notify({
      type: 'sent',
      ticketId: entry.ticketId,
      fault: entry.label.fault,
      photoErrors: entry.photoErrors,
    });
    notify({ type: 'changed' });
  }
  const left = (await listOutbox()).filter((e) => !e.error).length;
  return { sent, waiting: left };
}
