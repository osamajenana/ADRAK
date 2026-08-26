const API_PORT = process.env.NABD_API_PORT ?? '8001';

/**
 * Checks the API is up before any test runs.
 *
 * The API is started by hand rather than by Playwright, so it points at the same seeded database a
 * person is looking at and a test run cannot quietly wipe a demo. The cost of that is this check —
 * without it a forgotten server produces twenty timeouts instead of one clear sentence.
 */
export default async function globalSetup(): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${API_PORT}/up`);
    if (response.ok) return;
  } catch {
    // falls through to the message below
  }

  throw new Error(
    `The NABD API is not answering on port ${API_PORT}.\n` +
      `Start it first:  cd api && php artisan serve --port=${API_PORT}`,
  );
}
