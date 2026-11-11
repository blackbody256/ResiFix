/// <reference lib="webworker" />
// Workbox service worker (vite-plugin-pwa, injectManifest): offline app shell + Web Push.
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { flushOutbox, OUTBOX_SYNC_TAG } from './lib/outbox';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

void self.skipWaiting();
clientsClaim();

// App shell: everything Vite built is precached so the UI opens offline.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// API calls always hit the network: responses are per-user and must not be cached.
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// Offline fault reports (PB-005): the page saves a report made with no signal in the outbox
// (lib/outbox.ts) and registers this sync. The browser fires it once the connection is back,
// even with the app closed (Chrome/Android); elsewhere the page sends when it next opens.
// A plain Workbox queue cannot do this: the photo uploads need the id of the ticket created
// in the first request.
self.addEventListener('sync', (event) => {
  const e = event as ExtendableEvent & { tag?: string };
  if (e.tag !== OUTBOX_SYNC_TAG) return;
  // Rejecting makes the browser retry the sync later (with backoff) while reports still wait.
  e.waitUntil(
    flushOutbox().then(({ waiting }) => {
      if (waiting) throw new Error(`${waiting} report(s) still waiting to send`);
    }),
  );
});

// SPA navigations fall back to the cached index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);

// Web Push (PB-023/PB-024). Payload from server/src/notifications/web-push.service.ts.
interface PushPayload {
  title: string;
  body: string;
  url?: string;
  ticketId?: string;
}

self.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? { title: 'ResiFix', body: '' }) as PushPayload;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: data.ticketId,
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
