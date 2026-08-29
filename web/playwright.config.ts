import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.ADRAK_API_PORT ?? '8001';
const WEB_PORT = 5174;

/**
 * End-to-end configuration.
 *
 * Runs against the installed Chrome rather than a downloaded Chromium build. That is not a
 * shortcut: pulling ~150 MB of browser on this connection is a real cost, and Chrome on Android is
 * what these students actually use — testing the engine they run is closer to the truth than
 * testing a bundled one.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  // The drain test waits up to 45s for the outbox to empty after the network returns, which cannot
  // fit inside Playwright's 30s default — the test died on its own budget while the app was
  // behaving correctly. The drain measures ~32s; 60s leaves room without hiding a real regression.
  timeout: 60_000,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    // A cracked 5-inch phone is the target device, not a laptop. Layout bugs that only appear at
    // that width are the ones that reach a student.
    ...devices['Pixel 7'],
    channel: 'chrome',
  },

  projects: [{ name: 'chrome', use: { channel: 'chrome' } }],

  // Only the preview server is managed here. The API is started by hand against the same seeded
  // database, so a test run never silently resets a demo someone is looking at — globalSetup fails
  // with a readable message if it is not up.
  globalSetup: './e2e/global-setup.ts',

  webServer: {
    // --host is pinned to IPv4. Vite binds `localhost`, which resolves to ::1 on Windows,
    // while the readiness probe below dials 127.0.0.1 — the server starts and the check
    // times out against a different stack.
    command: `npx vite preview --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
