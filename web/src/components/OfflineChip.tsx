import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/db/schema';
import { isOnline, isSimulatedOffline } from '@/lib/api';

/**
 * The connection state, always visible and never alarming.
 *
 * Losing the network is the expected case here, so this is a status line rather than a warning: it
 * says what is saved and what is waiting, and it never blocks anything. A child who sees a red
 * error every time the signal drops learns that the app is broken, when the app is working exactly
 * as designed.
 */
export function OfflineChip({ syncing = false }: { syncing?: boolean }) {
  const [online, setOnline] = useState(isOnline());

  const pending = useLiveQuery(() => db.outbox.count(), [], 0);

  useEffect(() => {
    const update = () => setOnline(isOnline());

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    // The judge-mode switch flips a module-level flag rather than the real radio, so poll for it.
    const timer = setInterval(update, 1000);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      clearInterval(timer);
    };
  }, []);

  const waiting = pending ?? 0;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-offline-surface px-3 py-1.5 text-sm text-offline"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${online ? 'bg-mastered' : 'bg-offline'}`}
      />
      <span>
        {syncing ? 'تتم المزامنة…' : online ? 'متصل' : 'يعمل بدون إنترنت'}
        {waiting > 0 && ` · ${waiting} بانتظار المزامنة`}
      </span>
      {isSimulatedOffline() && <span className="text-subtle">(محاكاة)</span>}
    </div>
  );
}
