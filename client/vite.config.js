import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 5173,
    // Same-origin API in dev: no CORS needed.
    proxy: { '/api': 'http://localhost:3000' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [
    VitePWA({
      // Our own service worker (src/sw.js) built with Workbox; the plugin injects the precache list.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.js
      manifest: false, // we ship public/manifest.json ourselves
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,json}'] },
      devOptions: { enabled: false }, // SW only in `build`/`preview`, so dev reloads stay simple
    }),
  ],
});
