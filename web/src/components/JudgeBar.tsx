import { useEffect, useState } from 'react';
import { isSimulatedOffline, setSimulatedOffline } from '@/lib/api';

/**
 * The switch that makes the offline claim testable in ten seconds.
 *
 * Nobody evaluating this will turn off their own wi-fi to check whether the app really works
 * without a connection — and if they will not check it, the strongest thing about the product is
 * something they take on trust or ignore. So the app cuts itself off convincingly instead: every
 * request fails exactly the way a dead network fails, the student carries on from IndexedDB, and
 * reconnecting drains the queue in front of them.
 *
 * This is not a mock. It flips the same flag the real network state feeds, and nothing downstream
 * knows the difference.
 */
export function JudgeBar() {
  const [offline, setOffline] = useState(isSimulatedOffline());
  const [motionOff, setMotionOff] = useState(
    () => document.documentElement.dataset.motion === 'off',
  );

  useEffect(() => {
    setSimulatedOffline(offline);
  }, [offline]);

  useEffect(() => {
    // Battery saver: the same lever prefers-reduced-motion pulls, reachable by a student who will
    // never find the OS setting.
    if (motionOff) document.documentElement.dataset.motion = 'off';
    else document.documentElement.removeAttribute('data-motion');
  }, [motionOff]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOffline((v) => !v)}
        aria-pressed={offline}
        className={`rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors ${
          offline
            ? 'bg-brand text-brand-ink'
            : 'border border-line-strong bg-raised text-ink hover:border-brand'
        }`}
      >
        {offline ? '↺ أعد الاتصال' : '⚡ اقطع الإنترنت'}
      </button>

      <button
        type="button"
        onClick={() => setMotionOff((v) => !v)}
        aria-pressed={motionOff}
        className="rounded-[var(--radius-pill)] border border-line-strong bg-raised px-4 py-2 text-sm text-muted hover:border-brand"
      >
        {motionOff ? '🔋 وضع التوفير مفعّل' : '🔋 وضع توفير البطارية'}
      </button>
    </div>
  );
}
