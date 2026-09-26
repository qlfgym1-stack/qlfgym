import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

/// <reference types="vitest" />

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const versionFile = resolve(__dirname, 'version.json');
const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

const cacheName = `fitmanager-cache-${versionData.version}-${versionData.build}`;

export default defineConfig({
  define: {
    __VERSION_INFO__: JSON.stringify(versionData),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
        type: 'module',
      },
      includeAssets: ['favicon.ico', 'favicon-32.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Fitmanager Pro Dz',
        short_name: 'Fitmanager Pro Dz',
        description: 'Application de gestion complète pour salles de sport',
        theme_color: '#2563EB',
        background_color: '#080D18',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Ne précacher que le shell + les assets. Précacher tous les chunks JS
        // annulait le code-splitting (132 fichiers / ~4,5 Mo téléchargés d'un
        // coup) et alourdissait l'installation PWA au premier chargement.
        globPatterns: ['**/*.{html,ico,png,svg,woff2}'],
        globIgnores: ['**/Coach QLF AI.png', '**/assets/*.js', '**/assets/*.css'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/version\.json$/, /\.(?:json|png|ico|webp|svg|woff2?|txt)$/],
        runtimeCaching: [
          // Assets JS/CSS produits par Vite : mis en cache au fur et à mesure
          // de la navigation (respect du code-splitting).
          {
            urlPattern: ({ request }: { request: Request }) =>
              request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fitmanager-assets',
              expiration: { maxEntries: 160, maxAgeSeconds: 7 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
    {
      name: 'version-info',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(versionData, null, 2),
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});