import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiProxy = { '/api': 'http://localhost:3000' };

export default defineConfig({
  server: { port: 5173, proxy: apiProxy }, // same-origin API in dev: no CORS
  preview: { port: 4173, proxy: apiProxy },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own Workbox service worker (src/sw.ts): precache + Web Push handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.tsx
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      devOptions: { enabled: false }, // SW only in build/preview so dev reloads stay simple
      manifest: {
        name: 'ResiFix',
        short_name: 'ResiFix',
        description: 'Report and track hostel maintenance faults.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
