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
        name: 'أدرك — تعلّم من حيث أنت',
        short_name: 'أدرك',
        description: 'منصة تعليم تكيفي تعمل بدون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        // Matches the dark default: the splash a student sees must not flash white at them in a
        // dark tent.
        background_color: '#0A0F16',
        theme_color: '#0A0F16',
        // One entry serves both purposes here because this icon earns it: 512x512, a solid
        // ground, and the artwork inside the 205px safe circle. A transparent, non-square mark
        // declared `maskable` — which this once was — hands Android a logo it crops into and
        // paints an arbitrary background behind.
        icons: [
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // `vite preview` serves the built bundle and is what the end-to-end run drives, so it needs the
  // same /api proxy as dev. Without it the tests would exercise a build that cannot reach its API.
  preview: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.ADRAK_API_PORT ?? 8001}`,
        changeOrigin: true,
      },
    },
  },
  server: {
    // Same-origin /api in development, so the app talks to Laravel exactly as it will in
    // production and no CORS or cookie behaviour differs between the two.
    //
    // 8001 rather than Laravel's default 8000: another project on this machine holds 8000, and
    // `php artisan serve` will happily report success on an already-bound port on Windows — so
    // the proxy silently reaches the wrong application and every request 404s with a stack trace
    // from someone else's codebase. Override with ADRAK_API_PORT if 8001 is taken too.
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.ADRAK_API_PORT ?? 8001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Enforced by the performance budget in design/tokens.json: the student bundle has to reach a
    // phone on 2G. A warning at 200 KB is the tripwire.
    chunkSizeWarningLimit: 200,
  },
});
