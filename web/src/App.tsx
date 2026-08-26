import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { JudgeBar } from '@/components/JudgeBar';
import { OfflineChip } from '@/components/OfflineChip';
import { useActiveProfile } from '@/lib/session';
import { useSync } from '@/lib/useSync';
import { Home } from '@/screens/Home';
import { Login } from '@/screens/Login';

/**
 * Split out of the first load. The diagnostic runs once in a student's life and practice only after
 * they have a path, so neither belongs in the bundle a phone downloads on a 2G connection before it
 * has shown anything.
 */
const Diagnostic = lazy(() =>
  import('@/screens/Diagnostic').then((m) => ({ default: m.Diagnostic })),
);
const Practice = lazy(() => import('@/screens/Practice').then((m) => ({ default: m.Practice })));

export function App() {
  const profile = useActiveProfile();

  // Mounted at the root so the queue drains wherever the student happens to be — including while
  // they are still answering questions on the practice screen.
  const { syncing } = useSync(profile?.id);

  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" width={28} height={28} aria-hidden="true" />
            <span className="text-lg font-semibold text-ink">نبض</span>
          </div>
          <OfflineChip syncing={syncing} />
        </header>

        <div className="flex-1">
          <Suspense fallback={<p className="px-5 py-10 text-muted">لحظة…</p>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <RequireProfile>
                    <Home />
                  </RequireProfile>
                }
              />
              <Route
                path="/diagnostic"
                element={
                  <RequireProfile>
                    <Diagnostic />
                  </RequireProfile>
                }
              />
              <Route
                path="/practice/:code"
                element={
                  <RequireProfile>
                    <Practice />
                  </RequireProfile>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>

        {/*
         * Visible to anyone opening the public demo. It exists because the strongest thing about
         * this product is invisible unless you take the network away, and nobody evaluating it is
         * going to turn off their own wi-fi to find out.
         */}
        <footer className="border-t border-line px-5 py-4">
          <JudgeBar />
        </footer>
      </div>
    </BrowserRouter>
  );
}

function RequireProfile({ children }: { children: React.ReactNode }) {
  const profile = useActiveProfile();

  // undefined = Dexie has not answered yet. Redirecting on it would bounce a logged-in student to
  // the login screen for a frame every time they open the app.
  if (profile === undefined) return null;
  if (profile === null) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
