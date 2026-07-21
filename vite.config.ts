import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Amordle',
        short_name: 'Amordle',
        description: 'A word game built for fire, ice, and friendly competition.',
        theme_color: '#07090a',
        background_color: '#07090a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2,webp,avif}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/api/word-lists/manifest',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'amordle-public-manifest',
              expiration: { maxEntries: 2, maxAgeSeconds: 3600 },
            },
          },
          {
            urlPattern: ({ url }) =>
              /\/word-lists\/[^/]+\/words_length_\d+\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'amordle-public-word-lists',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: true,
    target: 'es2023',
  },
});
