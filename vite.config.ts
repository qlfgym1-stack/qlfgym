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
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.ico', 'favicon-32.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'QLF GYM',
        short_name: 'QLF GYM',
        description: 'Application de gestion complète pour salles de sport',
        theme_color: '#10b981',
        background_color: '#0a0a0a',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/Coach QLF AI.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/version\.json$/, /\.(?:json|png|ico|webp|svg|woff2?|txt)$/],
        runtimeCaching: [
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