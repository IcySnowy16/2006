import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Tasks F9 and Q4. Development: the app on :5173 forwards /api and /socket.io to the server on :3000, so the page and the API share
 * one origin and the login cookie needs no special settings. Production: the server serves the built files itself (CLIENT_DIST).
 * The PWA: a manifest (installable), a service worker that caches the app shell only, and never an API call.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Campus Hop',
        short_name: 'Campus Hop',
        description: 'Share a ride across the NTU campus.',
        theme_color: '#2b3a8f',
        background_color: '#f6f7fb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline: the app shell loads and says "you are offline". API and WebSocket calls are never cached or answered by the worker.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    // The client reads the shared contract straight from source, like the tests do.
    alias: { '@campus-hop/shared': path.resolve(import.meta.dirname, '../shared/src/index.ts') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
});
