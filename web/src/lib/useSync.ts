import { useCallback, useEffect, useRef, useState } from 'react';
import { drainOutbox, type SyncResponse } from '@/db/sync';
import { isOnline, post } from './api';

/**
 * Keeps the outbox draining in the background.
 *
 * Deliberately never blocks a student. Practice writes to IndexedDB and returns; this notices a
 * connection and sends what is waiting. If a connection never comes, the work simply waits — which
 * for many of these students is what will happen for days at a time.
 *
 * Three triggers, because each covers a case the others miss:
 *   - the browser's `online` event, for the moment a signal returns;
 *   - a slow interval, because that event does not fire when a captive portal starts working, or
 *     when the judge-mode switch flips a flag the browser knows nothing about;
 *   - mount, so reopening the app pushes yesterday's work before anything else.
 */

const POLL_MS = 20_000;

export interface SyncState {
  syncing: boolean;
  lastOutcome: 'synced' | 'offline' | 'nothing-to-send' | 'error' | null;
  lastAccepted: number;
}

export function useSync(profileId: number | undefined): SyncState & { syncNow: () => void } {
  const [state, setState] = useState<SyncState>({
    syncing: false,
    lastOutcome: null,
    lastAccepted: 0,
  });

  // A drain already in flight must not be started again by the interval firing mid-send: the
  // second call would read the same queue and re-send events the first is still delivering.
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (profileId === undefined || inFlight.current || !isOnline()) return;

    inFlight.current = true;
    setState((s) => ({ ...s, syncing: true }));

    try {
      const summary = await drainOutbox(profileId, (body) =>
        post<SyncResponse>('/sync', body).then((r) =>
          r.ok
            ? ({ ok: true, data: r.data } as const)
            : ({ ok: false, offline: r.offline } as const),
        ),
      );

      setState({
        syncing: false,
        lastOutcome: summary.outcome,
        lastAccepted: summary.accepted,
      });
    } finally {
      inFlight.current = false;
      setState((s) => ({ ...s, syncing: false }));
    }
  }, [profileId]);

  useEffect(() => {
    void run();

    const onOnline = () => void run();
    window.addEventListener('online', onOnline);

    const timer = setInterval(() => void run(), POLL_MS);

    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [run]);

  return { ...state, syncNow: () => void run() };
}
