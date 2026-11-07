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

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

void self.skipWaiting();
clientsClaim();

// App shell: everything Vite built is precached so the UI opens offline.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// API calls always hit the network: responses are per-user and must not be cached.
// TODO(PB-005): queue offline fault reports with workbox-background-sync.
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

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
