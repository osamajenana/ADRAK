import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The app shell is precached so a cold start with no network still renders. Content is
        // not: the skill graph and question banks live in IndexedDB, where the app owns them.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'نبض — تعلّم من حيث أنت',
        short_name: 'نبض',
        description: 'منصة تعليم تكيفي تعمل بدون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        // Matches the dark default: the splash a student sees must not flash white at them in a
        // dark tent.
        background_color: '#0A0F16',
        theme_color: '#0A0F16',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Enforced by the performance budget in design/tokens.json: the student bundle has to reach a
    // phone on 2G. A warning at 200 KB is the tripwire.
    chunkSizeWarningLimit: 200,
  },
});
