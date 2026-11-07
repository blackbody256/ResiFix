// Workbox service worker (built by vite-plugin-pwa, injectManifest strategy).
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

// App shell: everything Vite built is precached so the UI opens offline.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// API calls always hit the network. Responses are per-user and must not be cached.
// TODO(PB-005): queue offline fault reports with workbox-background-sync.
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// SPA navigations fall back to the cached index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);
